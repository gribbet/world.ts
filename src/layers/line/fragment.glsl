#version 300 es

precision highp float;

in vec4 color_out;
out vec4 result;

void main() {
    if (color_out.a == 0.f) discard;
    result = color_out;
}