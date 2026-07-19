"""Long-lived Build123D worker process.

Imports build123d / OCP (OpenCascade) ONCE at startup — the ~10s cold import is
paid a single time, then every render reuses the warm process. The Node backend
talks to this process over stdin/stdout using newline-delimited JSON:

  request  (stdin):  {"id": "<uuid>", "code": "...", "out_path": "...", "format": "stl"}
  response (stdout): {"id": "<uuid>", "ok": true}  |  {"id": "<uuid>", "ok": false, "error": "..."}

The geometry produced by the user's script must be assigned to a top-level
variable named `result` (a build123d Shape/Compound). The worker exports that
shape to `out_path` in the requested format (stl/step/brep). User stdout is
captured so stray print() calls cannot corrupt the response channel. If the
worker is killed (e.g. a render timeout), the backend respawns it next time.
"""

import io
import json
import struct
import sys
import traceback
from array import array

import build123d
from build123d import Compound, Shape, export_brep, export_step, export_stl
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.TopAbs import TopAbs_REVERSED, TopAbs_WIRE
from OCP.TopLoc import TopLoc_Location
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
from OCP.BRepTools import BRepTools_WireExplorer
from OCP.GeomAbs import GeomAbs_Plane
from OCP.GCPnts import GCPnts_TangentialDeflection

LINEAR_DEFLECTION = 0.1
ANGULAR_DEFLECTION = 0.5


def tessellate(result, out_path):
    shape = result.wrapped
    BRepMesh_IncrementalMesh(
        shape, LINEAR_DEFLECTION, False, ANGULAR_DEFLECTION
    ).Perform()

    positions = []
    faces_out = []
    tri_index = 0

    for fi, face in enumerate(result.faces()):
        loc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face.wrapped, loc)
        if tri is None:
            continue
        reverse_winding = face.wrapped.Orientation() == TopAbs_REVERSED
        trsf = loc.Transformation()
        n_nodes = tri.NbNodes()
        node_pts = []
        for i in range(1, n_nodes + 1):
            p = tri.Node(i)
            p.Transform(trsf)
            node_pts.append((p.X(), p.Y(), p.Z()))
        start_tri = tri_index
        fnx = fny = fnz = 0.0
        farea = 0.0
        fcx = fcy = fcz = 0.0
        for t in range(1, tri.NbTriangles() + 1):
            tri_obj = tri.Triangle(t)
            ia, ib, ic = tri_obj.Get()
            if reverse_winding:
                ib, ic = ic, ib
            ax, ay, az = node_pts[ia - 1]
            bx, by, bz = node_pts[ib - 1]
            cx, cy, cz = node_pts[ic - 1]
            positions.extend((ax, ay, az, bx, by, bz, cx, cy, cz))
            tri_index += 1
            ux, uy, uz = bx - ax, by - ay, bz - az
            vx, vy, vz = cx - ax, cy - ay, cz - az
            nx = uy * vz - uz * vy
            ny = uz * vx - ux * vz
            nz = ux * vy - uy * vx
            area = 0.5 * (nx * nx + ny * ny + nz * nz) ** 0.5
            fnx += nx
            fny += ny
            fnz += nz
            farea += area
            cenx = (ax + bx + cx) / 3.0
            ceny = (ay + by + cy) / 3.0
            cenz = (az + bz + cz) / 3.0
            fcx += cenx * area
            fcy += ceny * area
            fcz += cenz * area
        nlen = (fnx * fnx + fny * fny + fnz * fnz) ** 0.5
        if nlen > 0:
            fnx /= nlen
            fny /= nlen
            fnz /= nlen
        if farea > 0:
            fcx /= farea
            fcy /= farea
            fcz /= farea
        faces_out.append(
            {
                "id": "f%d" % fi,
                "startTri": start_tri,
                "endTri": tri_index,
                "normal": [round(fnx, 6), round(fny, 6), round(fnz, 6)],
                "area": round(farea, 6),
                "center": [round(fcx, 4), round(fcy, 4), round(fcz, 4)],
            }
        )

    edges_out = []
    for ei, edge in enumerate(result.edges()):
        curve = BRepAdaptor_Curve(edge.wrapped)
        sampler = GCPnts_TangentialDeflection(curve, 0.2, ANGULAR_DEFLECTION)
        n_pts = sampler.NbPoints()
        poly = []
        length = 0.0
        prev = None
        for i in range(1, n_pts + 1):
            p = sampler.Value(i)
            x, y, z = p.X(), p.Y(), p.Z()
            poly.extend((x, y, z))
            if prev is not None:
                dx, dy, dz = x - prev[0], y - prev[1], z - prev[2]
                length += (dx * dx + dy * dy + dz * dz) ** 0.5
            prev = (x, y, z)
        edges_out.append(
            {
                "id": "e%d" % ei,
                "positions": [round(v, 4) for v in poly],
                "length": round(length, 6),
                "adjacentFaceIds": [],
            }
        )

    verts_out = []
    for vi, vert in enumerate(result.vertices()):
        c = vert.center()
        verts_out.append(
            {
                "id": "v%d" % vi,
                "position": [round(c.X, 4), round(c.Y, 4), round(c.Z, 4)],
                "adjacentEdgeIds": [],
                "adjacentFaceIds": [],
            }
        )

    triangle_count = tri_index
    pos_arr = array("f", positions)
    if sys.byteorder == "big":
        pos_arr.byteswap()
    with open(out_path, "wb") as f:
        f.write(struct.pack("<I", triangle_count))
        pos_arr.tofile(f)

    with open(out_path + ".topo.json", "w") as f:
        json.dump(
            {"faces": faces_out, "edges": edges_out, "vertices": verts_out}, f
        )


def _parse_face_index(face_id):
    """Parse a face id of the form 'f<N>' into an integer index."""
    if not isinstance(face_id, str) or not face_id.startswith("f"):
        raise ValueError("face_id must look like 'f<N>' (got %r)." % (face_id,))
    try:
        return int(face_id[1:])
    except ValueError:
        raise ValueError("face_id must look like 'f<N>' (got %r)." % (face_id,))


def export_face_2d(result, face_id, out_path, fmt):
    """Export a single planar face's boundary to a 2D vector format (svg/dxf).

    Walks the face's wires (outer boundary + any holes) in order, discretizes
    each edge into a polyline, and projects the 3D points onto the face's
    plane using its local UV axes.
    """
    idx = _parse_face_index(face_id)
    faces_list = result.faces()
    n_faces = len(faces_list)
    if idx < 0 or idx >= n_faces:
        raise ValueError(
            "Face %s does not exist (the part has %d faces)." % (face_id, n_faces)
        )
    face = faces_list[idx]

    adaptor = BRepAdaptor_Surface(face.wrapped, True)
    if adaptor.GetType() != GeomAbs_Plane:
        raise ValueError(
            "Face %s is not planar; SVG/DXF export requires a flat face." % face_id
        )
    pln = adaptor.Plane()
    origin = pln.Location()
    ox, oy, oz = origin.X(), origin.Y(), origin.Z()
    xdir = pln.XAxis().Direction()
    ydir = pln.YAxis().Direction()
    xu, xv, xw = xdir.X(), xdir.Y(), xdir.Z()
    yu, yv, yw = ydir.X(), ydir.Y(), ydir.Z()

    def project(p):
        dx, dy, dz = p.X() - ox, p.Y() - oy, p.Z() - oz
        return (dx * xu + dy * xv + dz * xw, dx * yu + dy * yv + dz * yw)

    loops_2d = []
    wire_exp = TopExp_Explorer(face.wrapped, TopAbs_WIRE)
    while wire_exp.More():
        wire = TopoDS.Wire_s(wire_exp.Current())
        loop = []
        we = BRepTools_WireExplorer()
        we.Init(wire, face.wrapped)
        while we.More():
            edge = we.Current()
            edge_pts = []
            curve = BRepAdaptor_Curve(edge)
            sampler = GCPnts_TangentialDeflection(
                curve, LINEAR_DEFLECTION, ANGULAR_DEFLECTION
            )
            n_pts = sampler.NbPoints()
            for i in range(1, n_pts + 1):
                edge_pts.append(project(sampler.Value(i)))
            # Edges have their own orientation; flip REVERSED edges so the
            # sampled direction matches the wire traversal direction.
            if edge.Orientation() == TopAbs_REVERSED:
                edge_pts.reverse()
            loop.extend(edge_pts)
            we.Next()
        if len(loop) >= 2:
            loops_2d.append(loop)
        wire_exp.Next()

    if not loops_2d:
        raise ValueError("Face %s has no boundary." % face_id)

    if fmt == "svg":
        _write_face_svg(loops_2d, out_path)
    else:
        _write_face_dxf(loops_2d, out_path)


def _write_face_svg(loops_2d, out_path):
    xs = [p[0] for loop in loops_2d for p in loop]
    ys = [p[1] for loop in loops_2d for p in loop]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    width = max(maxx - minx, 1e-6)
    height = max(maxy - miny, 1e-6)
    pad = max(width, height) * 0.02 + 0.5

    def xform(p):
        u, v = p
        return ((u - minx) + pad, (maxy - v) + pad)

    body = []
    for loop in loops_2d:
        if len(loop) < 2:
            continue
        pts = " ".join("%.4f,%.4f" % xform(p) for p in loop)
        body.append(
            '<polygon points="%s" fill="none" stroke="black" stroke-width="0.4"/>'
            % pts
        )

    total_w = width + 2 * pad
    total_h = height + 2 * pad
    svg = (
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'width="%gmm" height="%gmm" viewBox="0 0 %g %g">\n'
        "%s\n</svg>\n"
    ) % (total_w, total_h, total_w, total_h, "\n".join(body))

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(svg)


def _write_face_dxf(loops_2d, out_path):
    import ezdxf

    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    for loop in loops_2d:
        if len(loop) < 2:
            continue
        first = loop[0]
        last = loop[-1]
        closed = abs(first[0] - last[0]) < 1e-4 and abs(first[1] - last[1]) < 1e-4
        pts = loop[:-1] if closed else loop
        msp.add_lwpolyline(pts, close=closed)
    doc.saveas(out_path)


def run_request(req):
    code = req.get("code", "")
    out_path = req["out_path"]
    fmt = str(req.get("format", "stl")).lower()
    face_id = req.get("face_id")

    namespace = {"__name__": "__main__", "__file__": out_path}
    real_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        exec(compile(code, "<user_script>", "exec"), namespace)
    except SystemExit as e:
        return {
            "ok": False,
            "error": "script called sys.exit(%s); do not call exit/export/print — just assign `result`."
            % (e.code,),
        }
    except BaseException:
        return {"ok": False, "error": traceback.format_exc()}
    finally:
        sys.stdout = real_stdout

    result = namespace.get("result")
    if result is None:
        return {
            "ok": False,
            "error": "ERROR: the script did not define a top-level 'result' object. "
            "Assign the final part to a variable named `result` "
            "(e.g. `result = Box(100, 100, 50)`).",
        }
    if not isinstance(result, (Shape, Compound)):
        return {
            "ok": False,
            "error": "ERROR: 'result' must be a build123d Shape or Compound (got %s)."
            % type(result).__name__,
        }

    if fmt == "tessellate":
        tessellate(result, out_path)
    elif fmt == "stl":
        export_stl(result, out_path)
    elif fmt == "step":
        export_step(result, out_path)
    elif fmt == "brep":
        export_brep(result, out_path)
    elif fmt in ("svg", "dxf"):
        if not face_id:
            return {
                "ok": False,
                "error": "ERROR: face_id is required for %s export." % fmt,
            }
        export_face_2d(result, face_id, out_path, fmt)
    else:
        return {"ok": False, "error": "ERROR: unsupported export format '%s'." % fmt}

    return {"ok": True}


def main():
    sys.stdout.write(
        json.dumps({"ready": True, "version": build123d.__version__}) + "\n"
    )
    sys.stdout.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:
            sys.stdout.write(
                json.dumps({"id": None, "ok": False, "error": "bad request: %s" % e})
                + "\n"
            )
            sys.stdout.flush()
            continue
        req_id = req.get("id")
        try:
            res = run_request(req)
        except BaseException:
            res = {"ok": False, "error": traceback.format_exc()}
        res["id"] = req_id
        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
