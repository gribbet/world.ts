#version 300 es

precision highp float;

uniform sampler2D image;
in vec2 uv_out;
out vec4 result;

void main() {
   float d = length(uv_out.xy);
   if (d >= 1.0) discard;
   float a = atan(uv_out.y, uv_out.x) / 2. / 3.14159;
   result = texture(image, vec2(d, a));
   if (result.a == 0.f) discard;
}