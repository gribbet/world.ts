#version 300 es

precision highp float;

uniform sampler2D imagery;
in vec2 uv;
out vec4 color;

void main(void) {
    color = texture(imagery, uv);
}