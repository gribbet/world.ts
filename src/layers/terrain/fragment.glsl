#version 300 es

precision highp float;

uniform sampler2D imagery;
uniform float saturation;
in vec2 uv;
in vec4 color_out;
out vec4 result;

void main(void) {
    vec4 texture_color = texture(imagery, uv);
    float luminance = dot(texture_color.rgb, vec3(0.299, 0.587, 0.114));
    result = vec4(mix(vec3(luminance), texture_color.rgb, saturation), texture_color.a) * color_out;
}