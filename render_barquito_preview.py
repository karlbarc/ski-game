import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view


bpy.ops.wm.open_mainfile(filepath="/Users/carlosbarcelo/projects/ski-game/barquito_3d.blend")
scene = bpy.context.scene
boat = bpy.data.objects["Barquito_Imprimible"]
preview_material = bpy.data.materials.new("Azul_preview")
preview_material.use_nodes = True
preview_bsdf = preview_material.node_tree.nodes.get("Principled BSDF")
preview_bsdf.inputs["Base Color"].default_value = (0.025, 0.32, 0.8, 1.0)
preview_bsdf.inputs["Metallic"].default_value = 0.15
preview_bsdf.inputs["Roughness"].default_value = 0.28
boat.data.materials.clear()
boat.data.materials.append(preview_material)


def point_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


# Suelo neutro para mostrar claramente la base plana.
bpy.ops.mesh.primitive_plane_add(size=500, location=(0, 0, -0.25))
floor = bpy.context.object
floor.name = "Suelo_preview"
floor_material = bpy.data.materials.new("Gris_suelo")
floor_material.use_nodes = True
floor_bsdf = floor_material.node_tree.nodes.get("Principled BSDF")
floor_bsdf.inputs["Base Color"].default_value = (0.035, 0.045, 0.06, 1.0)
floor_bsdf.inputs["Roughness"].default_value = 0.65
floor.data.materials.append(floor_material)

bpy.ops.object.camera_add(location=(135, -155, 105))
camera = bpy.context.object
camera.data.lens = 58
camera.data.clip_end = 1000
point_at(camera, (0, 0, 16))
scene.camera = camera

for location, energy, size in [
    ((80, -90, 150), 90000, 90),
    ((-90, -20, 85), 55000, 75),
    ((20, 100, 120), 70000, 80),
]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    point_at(light, (0, 0, 18))

scene.world.color = (0.035, 0.045, 0.065)
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 800
scene.render.resolution_y = 600
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = "/Users/carlosbarcelo/projects/ski-game/barquito_3d_preview.png"
scene.render.film_transparent = False
scene.view_settings.look = "AgX - Medium High Contrast"
print("CAMERA_PROJECTION", tuple(world_to_camera_view(scene, camera, Vector((0, 0, 16)))))
bpy.ops.render.render(write_still=True)
print("PREVIEW_OK", scene.render.filepath)
