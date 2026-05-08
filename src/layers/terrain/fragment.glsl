#version 300 es

precision highp float;

uniform sampler2D imagery;
uniform sampler2D overlay;
uniform int has_overlay;
uniform float saturation;
in vec2 uv;
in vec2 uv_overlay;
in vec4 color_out;
out vec4 result;

void main(void) {
    vec4 texture_color = texture(imagery, uv);
    if(has_overlay == 1) {
        vec4 overlay_color = texture(overlay, uv_overlay);
        float overlay_opacity = 0.75f * overlay_color.a;
        texture_color = vec4(mix(texture_color.rgb, overlay_color.rgb, overlay_opacity), overlay_opacity + texture_color.a * (1.0f - overlay_opacity));
    }
    float luminance = dot(texture_color.rgb, vec3(0.299f, 0.587f, 0.114f));
    result = vec4(mix(vec3(luminance), texture_color.rgb, saturation), texture_color.a) * color_out;
}