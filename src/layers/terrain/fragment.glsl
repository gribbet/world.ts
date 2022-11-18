#version 300 es

precision highp float;

uniform sampler2D imagery;
in vec2 uv;
out vec4 result;

void main(void) {
    result = texture(imagery, uv);
}