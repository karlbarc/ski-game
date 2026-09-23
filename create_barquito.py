import bpy
import bmesh
import math


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

material = bpy.data.materials.new("Azul_marino")
material.diffuse_color = (0.035, 0.22, 0.42, 1.0)

# Casco cerrado, redondeado y con una base completamente plana.
sections = [
    (-4.5, 1.65, 1.05),
    (-2.0, 1.90, 1.18),
    (1.8, 1.75, 1.28),
    (4.8, 0.16, 1.15),
]
vertices = []
for x, half_width, top_z in sections:
    vertices.extend(
        [
            (x, -half_width, top_z),
            (x, half_width, top_z),
            (x, half_width, 0.0),
            (x, -half_width, 0.0),
        ]
    )

faces = []
for index in range(len(sections) - 1):
    a = index * 4
    b = (index + 1) * 4
    faces.extend(
        [
            (a, a + 1, b + 1, b),
            (a + 1, a + 2, b + 2, b + 1),
            (a + 2, a + 3, b + 3, b + 2),
            (a + 3, a, b, b + 3),
        ]
    )
faces.extend([(0, 3, 2, 1), (12, 13, 14, 15)])

mesh = bpy.data.meshes.new("CascoMesh")
mesh.from_pydata(vertices, [], faces)
mesh.update()
boat = bpy.data.objects.new("Barquito_Imprimible", mesh)
bpy.context.collection.objects.link(boat)
boat.data.materials.append(material)


def bevel(obj, width):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Bordes_suaves", "BEVEL")
    modifier.width = width
    modifier.segments = 3
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def rounded_cube(name, location, scale, width):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bevel(obj, width)
    return obj


def rounded_cylinder(name, location, radius, depth, width):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=48, radius=radius, depth=depth, location=location
    )
    obj = bpy.context.object
    obj.name = name
    bevel(obj, width)
    return obj


bevel(boat, 0.16)
parts = [
    rounded_cube("Cabina", (-0.45, 0, 1.58), (1.50, 1.12, 0.62), 0.16),
    rounded_cube("Techo", (-0.45, 0, 2.25), (1.72, 1.34, 0.18), 0.14),
    rounded_cylinder("Chimenea", (-1.25, 0, 2.85), 0.34, 1.15, 0.09),
    rounded_cylinder("Remate_chimenea", (-1.25, 0, 3.43), 0.43, 0.18, 0.06),
]

# Uniones booleanas: el STL queda como una única pieza sólida.
bpy.context.view_layer.objects.active = boat
boat.select_set(True)
for part in parts:
    modifier = boat.modifiers.new(f"Union_{part.name}", "BOOLEAN")
    modifier.operation = "UNION"
    modifier.solver = "EXACT"
    modifier.object = part
    bpy.context.view_layer.objects.active = boat
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(part, do_unlink=True)

for polygon in boat.data.polygons:
    polygon.use_smooth = True
boat.data.set_sharp_from_angle(angle=math.radians(40))

# Dimensiones finales aproximadas: 95 x 38 x 36 mm.
boat.scale = (10, 10, 10)
bpy.context.view_layer.objects.active = boat
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
boat.location.z = -min(vertex.co.z for vertex in boat.data.vertices)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

boat["descripcion"] = "Barquito robusto para impresion 3D, base plana"
boat["unidades"] = "milimetros"
bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.length_unit = "MILLIMETERS"
bpy.context.scene.unit_settings.scale_length = 0.001

blend_path = "/Users/carlosbarcelo/projects/ski-game/barquito_3d.blend"
stl_path = "/Users/carlosbarcelo/projects/ski-game/barquito_3d.stl"
bpy.ops.wm.save_as_mainfile(filepath=blend_path)

bpy.ops.object.select_all(action="DESELECT")
boat.select_set(True)
bpy.context.view_layer.objects.active = boat
try:
    bpy.ops.wm.stl_export(filepath=stl_path, export_selected_objects=True)
except Exception:
    bpy.ops.export_mesh.stl(filepath=stl_path, use_selection=True)

bm = bmesh.new()
bm.from_mesh(boat.data)
non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
volume = abs(bm.calc_volume(signed=True))
bm.free()
print(
    "BARQUITO_OK",
    len(boat.data.vertices),
    len(boat.data.polygons),
    "NON_MANIFOLD",
    non_manifold,
    "VOLUME_MM3",
    round(volume, 1),
)
