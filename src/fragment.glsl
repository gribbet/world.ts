varying highp vec2 textureCoordinateOut;

uniform sampler2D sampler;

void main(void) {
  gl_FragColor = texture2D(sampler, textureCoordinateOut);
}