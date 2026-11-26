#!/usr/bin/env python3
# Generate a binary AndroidManifest.xml (AXML) for a minimal WebView app,
# without aapt2. Emits only a manifest (no resources.arsc needed; label is a
# literal string, no icon). Validated afterwards with androguard.
import struct, sys

# ---- attribute name strings (must come first, in resource-map order) ----
ATTRS = [
    ("versionCode", 0x0101021b),
    ("versionName", 0x0101021c),
    ("compileSdkVersion", 0x01010572),
    ("compileSdkVersionCodename", 0x01010573),
    ("minSdkVersion", 0x0101020c),
    ("targetSdkVersion", 0x01010270),
    ("label", 0x01010001),
    ("hasCode", 0x0101000c),
    ("allowBackup", 0x010102d5),
    ("usesCleartextTraffic", 0x0101064a),
    ("name", 0x01010003),
    ("exported", 0x01010010),
    ("icon", 0x01010002),
]
ATTR_NAMES = [a[0] for a in ATTRS]
RES_IDS = [a[1] for a in ATTRS]
IDX = {n: i for i, n in enumerate(ATTR_NAMES)}

# ---- remaining strings (order flexible) ----
EXTRA = [
    "android",
    "http://schemas.android.com/apk/res/android",
    "package",
    "platformBuildVersionCode",
    "platformBuildVersionName",
    "manifest", "uses-sdk", "application", "activity", "intent-filter", "action", "category",
    "com.godagent.app",            # package / value
    "1.0",                         # versionName
    "GODAgent",                    # label
    "com.godagent.app.MainActivity",
    "android.intent.action.MAIN",
    "android.intent.category.LAUNCHER",
    "",
]
STRINGS = ATTR_NAMES + EXTRA
SI = {s: i for i, s in enumerate(STRINGS)}

NS_URI = "http://schemas.android.com/apk/res/android"
NS_PREFIX = "android"

# Res_value data types
TYPE_STRING = 0x03
TYPE_INT_DEC = 0x10
TYPE_INT_BOOLEAN = 0x12
BOOL_TRUE = 0xFFFFFFFF

def res_value(dtype, data):
    # size(2)=8, res0(1)=0, dataType(1), data(4)
    return struct.pack("<HBBI", 8, 0, dtype, data & 0xFFFFFFFF)

def attr(name, dtype, data, raw_str_idx=0xFFFFFFFF, ns=True):
    ns_idx = SI[NS_URI] if ns else 0xFFFFFFFF
    name_idx = IDX[name] if name in IDX else SI[name]
    return struct.pack("<III", ns_idx, name_idx, raw_str_idx) + res_value(dtype, data)

def s_attr(name, value, ns=True):
    idx = SI[value]
    return attr(name, TYPE_STRING, idx, raw_str_idx=idx, ns=ns)

def i_attr(name, value, ns=True):
    return attr(name, TYPE_INT_DEC, value, ns=ns)

def b_attr(name, value, ns=True):
    return attr(name, TYPE_INT_BOOLEAN, BOOL_TRUE if value else 0, ns=ns)

TYPE_REFERENCE = 0x01
def ref_attr(name, res_id, ns=True):
    return attr(name, TYPE_REFERENCE, res_id, ns=ns)

# ---- string pool ----
def build_string_pool():
    data = b""
    offsets = []
    for s in STRINGS:
        offsets.append(len(data))
        u = s.encode("utf-16-le")
        n = len(s)
        data += struct.pack("<H", n) + u + b"\x00\x00"
    # pad string data to 4 bytes
    while len(data) % 4 != 0:
        data += b"\x00"
    off_table = b"".join(struct.pack("<I", o) for o in offsets)
    header_size = 28
    strings_start = header_size + len(off_table)
    size = strings_start + len(data)
    flags = 0  # UTF-16
    header = struct.pack("<HH I I I I I I",
                         0x0001, 28, size,
                         len(STRINGS), 0, flags, strings_start, 0)
    return header + off_table + data

def build_resource_map():
    body = b"".join(struct.pack("<I", r) for r in RES_IDS)
    size = 8 + len(body)
    header = struct.pack("<HHI", 0x0180, 8, size)
    return header + body

def ns_chunk(ctype):
    # 0x0100 start / 0x0101 end : header(16) + line + comment + prefix + uri
    body = struct.pack("<IIII", 1, 0xFFFFFFFF, SI[NS_PREFIX], SI[NS_URI])
    return struct.pack("<HHI", ctype, 16, 8 + len(body)) + body

def elem_start(tag, attrs, id_index=0):
    name_idx = SI[tag]
    attr_bytes = b"".join(attrs)
    ext = struct.pack("<II HHHHHH",
                      0xFFFFFFFF, name_idx,
                      0x14, 0x14, len(attrs), id_index, 0, 0)
    body = struct.pack("<II", 1, 0xFFFFFFFF) + ext + attr_bytes
    return struct.pack("<HHI", 0x0102, 16, 8 + len(body)) + body

def elem_end(tag):
    body = struct.pack("<IIII", 1, 0xFFFFFFFF, 0xFFFFFFFF, SI[tag])
    return struct.pack("<HHI", 0x0103, 16, 8 + len(body)) + body

# ---- build the tree ----
parts = []
parts.append(ns_chunk(0x0100))

# <manifest package="..." versionCode versionName compileSdk*>
manifest_attrs = [
    s_attr("package", "com.godagent.app", ns=False),
    i_attr("versionCode", 1),
    s_attr("versionName", "1.0"),
    i_attr("compileSdkVersion", 28),
    s_attr("compileSdkVersionCodename", "1.0"),
]
parts.append(elem_start("manifest", manifest_attrs))

# <uses-sdk minSdkVersion targetSdkVersion/>
parts.append(elem_start("uses-sdk", [i_attr("minSdkVersion", 21), i_attr("targetSdkVersion", 28)]))
parts.append(elem_end("uses-sdk"))

# <application label hasCode allowBackup usesCleartextTraffic>
app_attrs = [
    b_attr("usesCleartextTraffic", True),
    b_attr("hasCode", True),
    ref_attr("icon", 0x7F010000),
    s_attr("label", "GODAgent"),
]
parts.append(elem_start("application", app_attrs))

# <activity name exported>
parts.append(elem_start("activity", [s_attr("name", "com.godagent.app.MainActivity"), b_attr("exported", True)], id_index=0))
parts.append(elem_start("intent-filter", []))
parts.append(elem_start("action", [s_attr("name", "android.intent.action.MAIN")]))
parts.append(elem_end("action"))
parts.append(elem_start("category", [s_attr("name", "android.intent.category.LAUNCHER")]))
parts.append(elem_end("category"))
parts.append(elem_end("intent-filter"))
parts.append(elem_end("activity"))

parts.append(elem_end("application"))
parts.append(elem_end("manifest"))
parts.append(ns_chunk(0x0101))

body = build_string_pool() + build_resource_map() + b"".join(parts)
total = 8 + len(body)
out = struct.pack("<HHI", 0x0003, 8, total) + body
open(sys.argv[1], "wb").write(out)
print("wrote", sys.argv[1], total, "bytes")
