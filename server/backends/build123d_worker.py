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

import hashlib
import io
import json
import math
import struct
import sys
import traceback
from array import array

import build123d
from build123d import Compound, Shape, export_brep, export_step, export_stl
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.BRepExtrema import BRepExtrema_DistShapeShape
from OCP.TopAbs import TopAbs_REVERSED, TopAbs_WIRE
from OCP.TopLoc import TopLoc_Location
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
from OCP.BRepTools import BRepTools_WireExplorer
from OCP.GeomAbs import (
    GeomAbs_Plane,
    GeomAbs_Cylinder,
    GeomAbs_Sphere,
    GeomAbs_Circle,
)
from OCP.GCPnts import GCPnts_TangentialDeflection

LINEAR_DEFLECTION = 0.1
ANGULAR_DEFLECTION = 0.5

# 1-entry cache of the last-executed user script's `result`, keyed by code hash.
# Lets interactive measurement reuse an already-built shape instead of re-exec'ing
# the user's script on every click.
import typing as _typing

_SHAPE_CACHE: _typing.Dict[str, _typing.Any] = {"hash": None, "result": None}


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


def _parse_entity_index(prefix, raw_id, count):
    """Parse a topology id of the form 'f<N>' / 'e<N>' / 'v<N>' into an integer index."""
    label = {"f": "face", "e": "edge", "v": "vertex"}.get(prefix, "entity")
    if not isinstance(raw_id, str) or not raw_id.startswith(prefix):
        raise ValueError("%s id must look like '%s<N>' (got %r)." % (label, prefix, raw_id))
    try:
        idx = int(raw_id[len(prefix):])
    except ValueError:
        raise ValueError("%s id must look like '%s<N>' (got %r)." % (label, prefix, raw_id))
    if idx < 0 or idx >= count:
        raise ValueError("%s %s does not exist (the part has %d)." % (label.capitalize(), raw_id, count))
    return idx


def _round_vec(p, n=4):
    return [round(p[0], n), round(p[1], n), round(p[2], n)]


def _face_normal(face):
    """Fast face normal from the surface adaptor only — no triangulation."""
    adaptor = BRepAdaptor_Surface(face.wrapped, True)
    t = adaptor.GetType()
    if t == GeomAbs_Plane:
        d = adaptor.Plane().Axis().Direction()
        return (d.X(), d.Y(), d.Z())
    elif t == GeomAbs_Cylinder:
        d = adaptor.Cylinder().Axis().Direction()
        return (d.X(), d.Y(), d.Z())
    return None


def _edge_direction(edge):
    """Fast edge direction from curve endpoints — no GCPnts discretization."""
    curve = BRepAdaptor_Curve(edge.wrapped)
    f = curve.FirstParameter()
    l = curve.LastParameter()
    pf = curve.Value(f)
    pl = curve.Value(l)
    dx, dy, dz = pl.X() - pf.X(), pl.Y() - pf.Y(), pl.Z() - pf.Z()
    n = math.sqrt(dx * dx + dy * dy + dz * dz)
    if n < 1e-12:
        return None
    return (dx / n, dy / n, dz / n)


def _face_measure(face):
    """Return (area, center, normal, perimeter, radius) for a build123d Face.

    Computes area + center from the B-rep triangulation (same approach as
    tessellate()) and normal/radius from the surface adaptor — avoids relying
    on build123d high-level Vector properties whose accessor case varies.
    """
    adaptor = BRepAdaptor_Surface(face.wrapped, True)
    t = adaptor.GetType()
    radius = None
    normal = None
    if t == GeomAbs_Plane:
        d = adaptor.Plane().Axis().Direction()
        normal = (d.X(), d.Y(), d.Z())
    elif t == GeomAbs_Cylinder:
        radius = adaptor.Cylinder().Radius()
        d = adaptor.Cylinder().Axis().Direction()
        normal = (d.X(), d.Y(), d.Z())
    elif t == GeomAbs_Sphere:
        radius = adaptor.Sphere().Radius()

    # Ensure the face is triangulated (idempotent — BRepMesh skips if cached).
    BRepMesh_IncrementalMesh(
        face.wrapped, LINEAR_DEFLECTION, False, ANGULAR_DEFLECTION
    ).Perform()

    loc = TopLoc_Location()
    tri = BRep_Tool.Triangulation_s(face.wrapped, loc)
    area = 0.0
    fcx = fcy = fcz = 0.0
    tri_nx = tri_ny = tri_nz = 0.0
    if tri is not None:
        trsf = loc.Transformation()
        reverse_winding = face.wrapped.Orientation() == TopAbs_REVERSED
        n_nodes = tri.NbNodes()
        node_pts = []
        for i in range(1, n_nodes + 1):
            p = tri.Node(i)
            p.Transform(trsf)
            node_pts.append((p.X(), p.Y(), p.Z()))
        for t_idx in range(1, tri.NbTriangles() + 1):
            tri_obj = tri.Triangle(t_idx)
            ia, ib, ic = tri_obj.Get()
            if reverse_winding:
                ib, ic = ic, ib
            ax, ay, az = node_pts[ia - 1]
            bx, by, bz = node_pts[ib - 1]
            ccx, ccy, ccz = node_pts[ic - 1]
            ux, uy, uz = bx - ax, by - ay, bz - az
            vx, vy, vz = ccx - ax, ccy - ay, ccz - az
            nx = uy * vz - uz * vy
            ny = uz * vx - ux * vz
            nz = ux * vy - uy * vx
            tri_area = 0.5 * (nx * nx + ny * ny + nz * nz) ** 0.5
            area += tri_area
            tri_nx += nx
            tri_ny += ny
            tri_nz += nz
            fcx += (ax + bx + ccx) / 3.0 * tri_area
            fcy += (ay + by + ccy) / 3.0 * tri_area
            fcz += (az + bz + ccz) / 3.0 * tri_area

    if area > 0:
        fcx /= area
        fcy /= area
        fcz /= area
    center = (fcx, fcy, fcz)

    # Fallback normal from triangle winding if the surface adaptor didn't give one.
    if normal is None:
        nlen = (tri_nx ** 2 + tri_ny ** 2 + tri_nz ** 2) ** 0.5
        if nlen > 1e-12:
            normal = (tri_nx / nlen, tri_ny / nlen, tri_nz / nlen)

    perimeter = 0.0
    wire_exp = TopExp_Explorer(face.wrapped, TopAbs_WIRE)
    while wire_exp.More():
        wire = TopoDS.Wire_s(wire_exp.Current())
        we = BRepTools_WireExplorer()
        we.Init(wire, face.wrapped)
        while we.More():
            edge = we.Current()
            curve = BRepAdaptor_Curve(edge)
            sampler = GCPnts_TangentialDeflection(curve, LINEAR_DEFLECTION, ANGULAR_DEFLECTION)
            prev = None
            for i in range(1, sampler.NbPoints() + 1):
                p = sampler.Value(i)
                if prev is not None:
                    dx, dy, dz = p.X() - prev[0], p.Y() - prev[1], p.Z() - prev[2]
                    perimeter += (dx * dx + dy * dy + dz * dz) ** 0.5
                prev = (p.X(), p.Y(), p.Z())
            we.Next()
        wire_exp.Next()

    return area, center, normal, perimeter, radius


def _edge_measure(edge):
    """Return (length, start, end, is_arc, radius) for a build123d Edge.

    Length + endpoints come from GCPnts discretization (same approach as
    tessellate()), avoiding build123d's high-level Vector properties.
    """
    curve = BRepAdaptor_Curve(edge.wrapped)
    sampler = GCPnts_TangentialDeflection(curve, LINEAR_DEFLECTION, ANGULAR_DEFLECTION)
    n_pts = sampler.NbPoints()

    length = 0.0
    start = (0.0, 0.0, 0.0)
    end = (0.0, 0.0, 0.0)
    prev = None
    for i in range(1, n_pts + 1):
        p = sampler.Value(i)
        x, y, z = p.X(), p.Y(), p.Z()
        if i == 1:
            start = (x, y, z)
        if i == n_pts:
            end = (x, y, z)
        if prev is not None:
            dx, dy, dz = x - prev[0], y - prev[1], z - prev[2]
            length += (dx * dx + dy * dy + dz * dz) ** 0.5
        prev = (x, y, z)

    is_arc = curve.GetType() == GeomAbs_Circle
    radius = None
    if is_arc:
        try:
            radius = float(curve.Circle().Radius())
        except Exception:
            radius = None
    return length, start, end, is_arc, radius


def _min_distance(shape_a, shape_b):
    """Min distance between two TopoDS shapes. Returns (distance, pa, pb)."""
    calc = BRepExtrema_DistShapeShape()
    calc.LoadS1(shape_a)
    calc.LoadS2(shape_b)
    if not calc.Perform() or not calc.IsDone():
        raise ValueError("could not compute distance between entities")
    d = float(calc.Value())
    # If the entities overlap (distance ~ 0), PointOnShape returns a single point on each.
    pa = calc.PointOnShape1(1)
    pb = calc.PointOnShape2(1)
    return d, (pa.X(), pa.Y(), pa.Z()), (pb.X(), pb.Y(), pb.Z())


def _angle_between(v1, v2):
    """Angle in degrees between two 3-vectors (None if either is zero)."""
    n1 = math.sqrt(sum(c * c for c in v1))
    n2 = math.sqrt(sum(c * c for c in v2))
    if n1 < 1e-12 or n2 < 1e-12:
        return None
    dot = sum(a * b for a, b in zip(v1, v2)) / (n1 * n2)
    dot = max(-1.0, min(1.0, dot))
    return math.degrees(math.acos(dot))


def measure(result, picks, mode, out_path):
    """Compute measurements for a list of entity picks and write JSON to out_path.

    Output: {"results": [ {"kind": "single", "entity": {...}} | {"kind": "pair", "pair": {...}} ]}

    - mode "single":  one single-entity result per pick
    - mode "pair":    if len(picks) >= 2 → one pair result for the last 2 picks;
                      if len(picks) == 1 → one single-entity result
    - mode "chain":   N-1 pair results for consecutive pick pairs;
                      if len(picks) == 1 → one single-entity result
    """
    faces = list(result.faces())
    edges = list(result.edges())
    vertices = list(result.vertices())

    def resolve(pick):
        kind = pick.get("kind")
        rid = pick.get("id")
        if kind == "face":
            idx = _parse_entity_index("f", rid, len(faces))
            return ("face", faces[idx])
        if kind == "edge":
            idx = _parse_entity_index("e", rid, len(edges))
            return ("edge", edges[idx])
        if kind == "vertex":
            idx = _parse_entity_index("v", rid, len(vertices))
            return ("vertex", vertices[idx])
        raise ValueError("pick.kind must be 'face' | 'edge' | 'vertex' (got %r)" % (kind,))

    def single(pick):
        kind, obj = resolve(pick)
        if kind == "face":
            area, center, normal, perimeter, radius = _face_measure(obj)
            out = {
                "kind": "face",
                "id": pick["id"],
                "area": round(area, 6),
                "center": _round_vec(center),
                "perimeter": round(perimeter, 6),
            }
            if normal is not None:
                out["normal"] = _round_vec(normal, 6)
            if radius is not None:
                out["radius"] = round(radius, 6)
            return {"kind": "single", "entity": out}
        if kind == "edge":
            length, start, end, is_arc, radius = _edge_measure(obj)
            out = {
                "kind": "edge",
                "id": pick["id"],
                "length": round(length, 6),
                "endpoints": [_round_vec(start), _round_vec(end)],
                "isArc": is_arc,
            }
            if radius is not None:
                out["radius"] = round(radius, 6)
            return {"kind": "single", "entity": out}
        # vertex — OCP direct (BRep_Tool.Pnt_s returns gp_Pnt)
        pnt = BRep_Tool.Pnt_s(obj.wrapped)
        return {
            "kind": "single",
            "entity": {
                "kind": "vertex",
                "id": pick["id"],
                "position": _round_vec((pnt.X(), pnt.Y(), pnt.Z())),
            },
        }

    def pair(pick_a, pick_b):
        ka, oa = resolve(pick_a)
        kb, ob = resolve(pick_b)
        distance, pa, pb = _min_distance(oa.wrapped, ob.wrapped)
        delta = [round(pb[0] - pa[0], 6), round(pb[1] - pa[1], 6), round(pb[2] - pa[2], 6)]

        angle_deg = None
        parallel = None

        if ka == "face" and kb == "face":
            na = _face_normal(oa)
            nb = _face_normal(ob)
            if na is not None and nb is not None:
                # Dihedral: 180° = flat continuation, 90° = perpendicular.
                theta = _angle_between(na, nb)
                if theta is not None:
                    angle_deg = round(180.0 - theta, 4)
                dot = sum(a * b for a, b in zip(na, nb))
                parallel = abs(abs(dot) - 1.0) < 1e-4

        elif ka == "edge" and kb == "edge":
            da = _edge_direction(oa)
            db = _edge_direction(ob)
            if da is not None and db is not None:
                angle_deg = _angle_between(da, db)
                if angle_deg is not None:
                    angle_deg = round(angle_deg, 4)
                dot = sum(a * b for a, b in zip(da, db))
                parallel = abs(abs(dot) - 1.0) < 1e-4

        out = {
            "kind": "pair",
            "pair": {
                "a": {"kind": ka, "id": pick_a["id"]},
                "b": {"kind": kb, "id": pick_b["id"]},
                "distance": round(distance, 6),
                "delta": delta,
                "closestA": _round_vec(pa),
                "closestB": _round_vec(pb),
            },
        }
        if angle_deg is not None:
            out["pair"]["angleDeg"] = angle_deg
        if parallel is not None:
            out["pair"]["parallel"] = parallel
        return out

    results = []
    if len(picks) == 0:
        pass
    elif mode == "single":
        for p in picks:
            results.append(single(p))
    elif mode == "pair":
        if len(picks) >= 2:
            results.append(pair(picks[-2], picks[-1]))
        else:
            results.append(single(picks[0]))
    elif mode == "chain":
        if len(picks) == 1:
            results.append(single(picks[0]))
        else:
            for i in range(len(picks) - 1):
                results.append(pair(picks[i], picks[i + 1]))
    else:
        raise ValueError("mode must be 'single' | 'pair' | 'chain' (got %r)" % (mode,))

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"results": results}, f)


def _exec_user_script(code):
    """Exec the user script and return the `result` shape. 1-entry code-hash cached."""
    h = hashlib.sha256(code.encode("utf-8")).hexdigest()
    if _SHAPE_CACHE["hash"] == h and _SHAPE_CACHE["result"] is not None:
        return _SHAPE_CACHE["result"], None

    namespace = {"__name__": "__main__", "__file__": "<user_script>"}
    real_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        exec(compile(code, "<user_script>", "exec"), namespace)
    except SystemExit as e:
        return None, {
            "ok": False,
            "error": "script called sys.exit(%s); do not call exit/export/print — just assign `result`."
            % (e.code,),
        }
    except BaseException:
        return None, {"ok": False, "error": traceback.format_exc()}
    finally:
        sys.stdout = real_stdout

    result = namespace.get("result")
    if result is None:
        return None, {
            "ok": False,
            "error": "ERROR: the script did not define a top-level 'result' object. "
            "Assign the final part to a variable named `result` "
            "(e.g. `result = Box(100, 100, 50)`).",
        }
    if not isinstance(result, (Shape, Compound)):
        return None, {
            "ok": False,
            "error": "ERROR: 'result' must be a build123d Shape or Compound (got %s)."
            % type(result).__name__,
        }

    _SHAPE_CACHE["hash"] = h
    _SHAPE_CACHE["result"] = result
    return result, None


def run_request(req):
    code = req.get("code", "")
    out_path = req["out_path"]
    fmt = str(req.get("format", "stl")).lower()
    face_id = req.get("face_id")

    result, err = _exec_user_script(code)
    if err is not None:
        return err

    if fmt == "tessellate":
        tessellate(result, out_path)
    elif fmt == "measure":
        picks = req.get("picks", [])
        mode = str(req.get("mode", "pair"))
        measure(result, picks, mode, out_path)
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
