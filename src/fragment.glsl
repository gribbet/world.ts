varying highp vec2 uvOut;

uniform sampler2D sampler;

void main(void) {
  gl_FragColor = texture2D(sampler, uvOut);
}