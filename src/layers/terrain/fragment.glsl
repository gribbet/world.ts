#version 300 es

precision highp float;

uniform sampler2D imagery;
in vec2 uv;
in vec4 color_out;
out vec4 result;

void main(void) {
    result = texture(imagery, uv) * color_out;
}