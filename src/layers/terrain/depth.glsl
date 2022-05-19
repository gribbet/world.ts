highp vec2 packDepth(in highp float depth) {
    highp float depthVal = depth * (256. * 256. - 1.) / (256. * 256.);
    highp vec3 encode = fract(depthVal * vec3(1., 256., 256. * 256.));
    return encode.xy - encode.yz / 256. + 1. / 512.;
}

void main(void) {
    gl_FragColor = vec4(packDepth(gl_FragCoord.z), 0, 1.);
}
