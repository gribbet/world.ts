#version 300 es

precision highp float;

uniform sampler2D image;
in vec2 uv_out;
in vec4 color_out;
out vec4 result;

void main() {
   result = texture(image, uv_out) * color_out;
}