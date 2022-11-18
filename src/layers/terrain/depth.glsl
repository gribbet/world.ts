#version 300 es

precision highp float;

out vec4 result;

vec2 pack_depth(in float depth) {
    float depth_val = depth * (256. * 256. - 1.) / (256. * 256.);
    vec3 encode = fract(depth_val * vec3(1., 256., 256. * 256.));
    return encode.xy - encode.yz / 256. + 1. / 512.;
}

void main(void) {
    result = vec4(pack_depth(gl_FragCoord.z), 0, 1.);
}
