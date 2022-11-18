#version 300 es

precision highp float;

in vec4 color_out;
out vec4 result;

void main() {
    result = color_out;
}