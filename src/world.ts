import { glMatrix, mat4, vec2, vec3 } from "gl-matrix";
import { debounce } from "./common";
import { circumference } from "./constants";
import { Layer } from "./layer";
import { createLineLayer } from "./line-layer";
import { geodetic, mercator, quadratic } from "./math";
import { createPickBuffer } from "./pick-buffer";
import { createTileLayer } from "./tile-layer";
import { View, viewport } from "./viewport";

glMatrix.setMatrixArrayType(Array);

export interface World {
  destroy: () => void;
}

interface Anchor {
  screen: vec2;
  world: vec3;
  distance: number;
}

export const world: (canvas: HTMLCanvasElement) => World = (canvas) => {
  let bearing = 0;
  let pitch = 0;
  let anchor: Anchor | undefined;
  const pickScale = 0.5;

  let view: View = {
    projection: mat4.create(),
    modelView: mat4.create(),
    camera: mercator([0, 0, circumference]),
    width: 0,
    height: 0,
  };

  const gl = canvas.getContext("webgl") as WebGL2RenderingContext;
  if (!gl) throw new Error("WebGL context failure");

  const tileLayer = createTileLayer(gl);

  const lineLayer = createLineLayer(gl);

  const layers: Layer[] = [tileLayer, lineLayer];

  const pickBuffer = createPickBuffer(gl);

  const resize = (width: number, height: number) => {
    view.width = width;
    view.height = height;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    pickBuffer.resize([width * pickScale, height * pickScale]);
  };

  resize(canvas.clientWidth, canvas.clientHeight);

  const resizer = new ResizeObserver(([{ contentRect }]) => {
    const { width, height } = contentRect;
    resize(width, height);
  });
  resizer.observe(canvas);

  const render = ({ depth }: { depth?: boolean } = {}) => {
    const scale = depth ? pickScale : devicePixelRatio;
    const width = view.width * scale;
    const height = view.height * scale;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, width, height);

    if (depth) {
      layers.forEach((_) =>
        _.depth({
          ...view,
          width,
          height,
        })
      );
    } else {
      layers.forEach((_) =>
        _.render({
          ...view,
          width,
          height,
        })
      );
    }
  };

  const frame = () => {
    setupMatrices();

    if (anchor) recenter(anchor);

    render();

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);

  const setupMatrices = () => {
    const { projection, modelView, camera, width, height } = view;

    const [, , z] = camera;
    const near = z / 100;
    const far = 100 * z;
    mat4.identity(projection);
    mat4.perspective(
      projection,
      (45 * Math.PI) / 180,
      width / height,
      near,
      far
    );
    mat4.scale(projection, projection, [1, -1, 1]);

    mat4.identity(modelView);
    mat4.rotateX(modelView, modelView, pitch);
    mat4.rotateZ(modelView, modelView, bearing);
  };

  const recenter = (anchor: Anchor) => {
    const { screen, world, distance } = anchor;
    const { screenToClip, clipToLocal } = viewport(view);

    const [x, y] = screenToClip(screen);
    const [ax, ay, az] = clipToLocal([x, y, -100, 1]);
    const [bx, by, bz] = clipToLocal([x, y, 100, 1]);

    const [t1] = quadratic(
      (bx - ax) * (bx - ax) + (by - ay) * (by - ay) + (bz - az) * (bz - az),
      ax * (bx - ax) + ay * (by - ay) + az * (bz - az),
      ax * ax + ay * ay + az * az - distance * distance
    );

    const local: vec3 = [
      ax + t1 * (bx - ax),
      ay + t1 * (by - ay),
      az + t1 * (bz - az),
    ];

    view.camera = vec3.sub(vec3.create(), mercator(world), local);
  };

  const pick = ([screenX, screenY]: vec2) => {
    const { screenToClip, clipToLocal, localToWorld } = viewport(view);

    pickBuffer.use(() => render({ depth: true }));

    const z = pickBuffer.read([screenX * pickScale, screenY * pickScale]);

    const [x, y] = screenToClip([screenX, screenY]);
    return geodetic(localToWorld(clipToLocal([x, y, z, 1])));
  };

  const destroy = () => {
    resizer.unobserve(canvas);
    // TODO: Destroy
  };

  const mouseAnchor: (screen: vec2) => Anchor = (screen) => {
    const { camera } = view;
    const world = pick(screen);
    const distance = vec3.distance(mercator(world), camera);
    return {
      screen,
      world,
      distance,
    };
  };

  const clearAnchor = debounce(() => {
    anchor = undefined;
  }, 100);

  canvas.addEventListener("mousedown", ({ x, y }) => {
    anchor = mouseAnchor([x, y]);
  });

  canvas.addEventListener(
    "mousemove",
    ({ buttons, movementX, movementY, x, y }) => {
      if (!anchor) return;
      if (buttons === 1) {
        anchor = {
          ...anchor,
          screen: [x, y],
        };
      } else if (buttons === 2) {
        const { width, height } = view;
        bearing -= (movementX / width) * Math.PI;
        pitch = Math.min(
          0.5 * Math.PI,
          Math.max(0, pitch - (movementY / height) * Math.PI)
        );
      }
    }
  );

  canvas.addEventListener("mouseup", clearAnchor);

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const { x, y } = event;
    if (!anchor) anchor = mouseAnchor([x, y]);
    anchor = {
      ...anchor,
      distance: anchor.distance * Math.exp(event.deltaY * 0.001),
    };
    clearAnchor();
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  return {
    destroy,
  };
};
