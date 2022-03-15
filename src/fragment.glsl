varying highp vec2 uvOut;

uniform sampler2D imagery;

highp vec3 packDepth(in highp float depth) {
  highp float depthVal = depth * (256.0 * 256.0 * 256.0 - 1.0) / (256.0 * 256.0 * 256.0);
  highp vec4 encode = fract(depthVal * vec4(1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0));
  return encode.xyz - encode.yzw / 256.0 + 1.0 / 512.0;
}

void main(void) {
  gl_FragColor = texture2D(imagery, uvOut);//vec4(packDepth(gl_FragCoord.z), 1.0);
}
