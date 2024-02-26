#version 300 es

precision highp float;

uniform sampler2D dash;
uniform float dash_offset;
uniform float dash_size;

in vec4 color_out;
in float distance_out;
out vec4 result;

void main() {
    if (color_out.a == 0.f) discard;
    result = color_out * texture(
      dash, 
      vec2(fract((distance_out / dash_size) - dash_offset), 0.0));;
}