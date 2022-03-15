varying highp vec2 uvOut;

uniform sampler2D imagery;

highp vec2 packDepth(in highp float depth) {
  highp float depthVal = depth * (256.0 * 256.0 - 1.0) / (256.0 * 256.0);
  highp vec3 encode = fract(depthVal * vec3(1.0, 256.0, 256.0 * 256.0));
  return encode.xy - encode.yz / 256.0 + 1.0 / 512.0;
}

void main(void) {
  gl_FragColor = vec4(packDepth(gl_FragCoord.z), 0.0, 1.0);
}
