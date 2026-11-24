"""Export PyLabRobot's resource library as plain data (issue #55).

PyLabRobot defines its labware, carriers, adapters, modules and decks as
Python factory functions, not data files. This script runs ONLY inside an
isolated environment with PyLabRobot installed from a pinned commit (see
scripts/labware-from-pylabrobot.mjs). It calls every no-argument factory in
pylabrobot.resources and writes the geometry the planner needs as JSON. The
planner site never ships or runs PyLabRobot code; it reads this output.

Usage: python plr_labware_export.py <output.json>
"""
import importlib
import inspect
import json
import pkgutil
import sys
import warnings

import pylabrobot
import pylabrobot.resources as resources
from pylabrobot.resources import Resource

warnings.filterwarnings("ignore")


def num(v):
  return None if v is None else round(float(v), 3)


def summarise(res):
  """The fields that decide what fits where, for one constructed resource."""
  out = {
    "type": type(res).__name__,
    "category": getattr(res, "category", None),
    "model": getattr(res, "model", None),
    "size_mm": [num(res.get_size_x()), num(res.get_size_y()), num(res.get_size_z())],
  }
  for attr in ("plate_type",):
    if getattr(res, attr, None) is not None:
      out[attr] = getattr(res, attr)
  # Plates, tube racks, troughs: wells or holes and their capacity.
  items = [c for c in res.children if type(c).__name__ in ("Well", "Tube", "Container", "TubeRack")]
  wells = [c for c in res.children if type(c).__name__ == "Well"]
  if wells:
    w = wells[0]
    out["wells"] = len(wells)
    out["well"] = {
      "max_volume_ul": num(getattr(w, "max_volume", None)),
      "bottom_type": str(getattr(w, "bottom_type", "")).split(".")[-1] or None,
      "cross_section": str(getattr(w, "cross_section_type", "")).split(".")[-1] or None,
      "size_mm": [num(w.get_size_x()), num(w.get_size_y()), num(w.get_size_z())],
    }
  # Holders: carrier sites, tube spots, module plate positions.
  sites = []
  for c in res.children:
    t = type(c).__name__
    if t in ("ResourceHolder", "PlateHolder", "TipSpot", "TubeHolder") or "Holder" in t or "Site" in t:
      sites.append({"type": t, "size_mm": [num(c.get_size_x()), num(c.get_size_y()), num(c.get_size_z())],
                    "pedestal_mm": num(getattr(c, "pedestal_size_z", None))})
  if sites:
    first = sites[0]
    out["sites"] = {"count": len(sites), "types": sorted({s["type"] for s in sites}), "first": first}
  if not wells and items:
    out["children"] = {"count": len(items), "types": sorted({type(c).__name__ for c in items})}
  doc = inspect.getdoc(res.__class__) if False else None
  return out


def modules(failures):
  """Every module under pylabrobot.resources. Deprecated packages that raise on
  import are recorded and skipped (pkgutil.walk_packages would stop there)."""
  stack = [(resources.__path__, resources.__name__)]
  while stack:
    path, prefix = stack.pop()
    for info in pkgutil.iter_modules(path):
      name = f"{prefix}.{info.name}"
      if name.endswith("_tests") or ".tests" in name:
        continue
      try:
        m = importlib.import_module(name)
      except Exception as e:  # noqa: BLE001 - record and continue
        failures.append({"module": name, "error": f"import: {type(e).__name__}: {e}"[:200]})
        continue
      yield name, m
      if info.ispkg:
        stack.append((m.__path__, name))


def main(path):
  records, failures = {}, []
  for name, m in modules(failures):
    for fname, fn in inspect.getmembers(m, inspect.isfunction):
      if fn.__module__ != name or fname.startswith("_") or fname.startswith("test"):
        continue
      sig = inspect.signature(fn)
      required = [p for p in sig.parameters.values() if p.default is p.empty and p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD, p.KEYWORD_ONLY)]
      # Factories take an optional or required `name`; nothing else may be required.
      if any(p.name != "name" for p in required):
        continue
      try:
        res = fn(name=fname) if "name" in sig.parameters else fn()
      except Exception as e:  # noqa: BLE001
        failures.append({"module": name, "factory": fname, "error": f"{type(e).__name__}: {e}"[:200]})
        continue
      if not isinstance(res, Resource):
        continue
      rec = summarise(res)
      rec["module"] = name.replace("pylabrobot.resources.", "")
      doc = inspect.getdoc(fn)
      if doc:
        rec["doc"] = " ".join(doc.split())[:600]
      records[fname] = rec
  out = {
    "pylabrobotVersion": open(pylabrobot.__file__.replace("__init__.py", "version.txt")).read().strip(),
    "count": len(records),
    "failures": failures,
    "resources": dict(sorted(records.items())),
  }
  with open(path, "w") as f:
    json.dump(out, f, indent=1, sort_keys=False)
  print(f"exported {len(records)} resources, {len(failures)} failures")


if __name__ == "__main__":
  main(sys.argv[1])
