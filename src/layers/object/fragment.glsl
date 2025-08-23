#version 300 es

precision highp float;

in vec4 color_out;
in vec2 uv_out;
uniform sampler2D albedo;
out vec4 result;

void main() {
    if (color_out.a == 0.f) discard;
    vec4 tex = texture(albedo, uv_out);
    result = tex.a == 0.f ? color_out : color_out * tex;
}