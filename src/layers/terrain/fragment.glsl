varying highp vec2 uvOut;

uniform sampler2D imagery;

void main(void) {
    gl_FragColor = texture2D(imagery, uvOut);
}