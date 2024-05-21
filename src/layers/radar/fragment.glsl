#version 300 es

precision highp float;

uniform sampler2D image;
in vec2 uv_out;
out vec4 result;

void main() {
   float d = length(uv_out.xy);
   if (d >= 1.0) discard;
   float a = atan(uv_out.y, uv_out.x) / 2. / 3.14159;
   vec4 value = texture(image, vec2(d, a));
   if (value.r == 0.f) discard;
   result = vec4(0, 1., 0, value.r);
}