PERFORMANCE STRATEGY:
- Single HTML file, inline everything
- Three.js r128 (stable, CDN)
- Instanced meshes for ants (InstancedMesh = 1 draw call for all ants)
- Procedural tunnel geometry using BufferGeometry (not dozens of boxes)
- Vertex-colored geometry instead of materials per object
- Low-poly organic tunnel walls using CylinderGeometry segments bent along path
- Baked ambient occlusion via vertex colors
- Frustum culling stays on (default)
- No shadow maps (too expensive) - use fake AO + point lights only
- Object pooling for ant instances
- Delta-time capped movement

VISUAL STRATEGY:
- Organic tunnel walls: extruded tube along curved path, irregular vertex noise
- Dirt/soil aesthetic: layered browns, roots hanging from ceiling  
- Bioluminescent mushrooms/fungi as light sources (point lights, low intensity)
- Ant anatomy: detailed segments, proper ant shape
- Particle effects: dirt falling, spore dust
- Post-processing style via CSS mix-blend or canvas overlay
- Queen chamber: dramatic red lighting, egg cluster, throne-like
- HUD: minimal, military-grade, integrated feel
