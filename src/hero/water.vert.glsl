// Full-screen quad. The orthographic camera maps the plane to clip space
// 1:1, so we just pass UVs straight through to the fragment shader.
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
