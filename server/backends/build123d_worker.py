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
import sys
import traceback

import build123d
from build123d import Compound, Shape, export_brep, export_step, export_stl


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

    if fmt == "stl":
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
