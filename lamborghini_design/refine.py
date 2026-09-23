import bpy,os
out='/Users/carlosbarcelo/projects/ski-game/lamborghini_design'
bpy.ops.wm.open_mainfile(filepath=out+'/lamborghini.blend')
m=bpy.data.materials['Giallo • pintura perlada'];m.diffuse_color=(.95,.43,.006,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=m.diffuse_color;p.inputs['Metallic'].default_value=.22;p.inputs['Roughness'].default_value=.3
bpy.context.scene.view_settings.exposure=-.65
for o in bpy.data.objects:
 if o.name.startswith('Soporte alerón'):o.scale.z=.65;o.location.z-=.065
 if o.name.startswith('Alerón SV') or o.name.startswith('Extremo alerón'):o.location.z-=.13
for sc in bpy.data.screens:
 for a in sc.areas:
  if a.type=='VIEW_3D':
   a.spaces.active.overlay.show_overlays=False
   a.spaces.active.region_3d.view_camera_zoom=12
bpy.ops.wm.save_as_mainfile(filepath=out+'/lamborghini.blend')
bpy.ops.render.render(write_still=True)
