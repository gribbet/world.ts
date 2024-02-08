#version 300 es

precision highp float;

uniform int index;

out vec4 result;

vec2 pack_depth(in float depth) {
    float value = depth * (256.f * 256.f - 1.f) / (256.f * 256.f);
    vec3 encode = fract(value * vec3(1.f, 256.f, 256.f * 256.f));
    return encode.xy - encode.yz / 256.f + 1.f / 512.f;
}

vec2 pack_index(in int index) {
    float value = float(index) / 256.f;
    return vec2(floor(value) / 255.f, fract(value) * 256.f / 255.f);
}

void main(void) {
    result = vec4(pack_depth(gl_FragCoord.z), pack_index(index));
}
