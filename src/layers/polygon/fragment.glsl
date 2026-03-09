#version 300 es

precision highp float;

uniform sampler2D image;

in vec4 color_out;
in vec2 uv_out;
out vec4 result;

void main() {
    result = color_out * texture(image, uv_out);
}