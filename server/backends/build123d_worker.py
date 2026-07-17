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
from OCP.TopLoc import TopLoc_Location
from OCP.BRepAdaptor import BRepAdaptor_Curve
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


def run_request(req):
    code = req.get("code", "")
    out_path = req["out_path"]
    fmt = str(req.get("format", "stl")).lower()

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
