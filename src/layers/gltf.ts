import type { quat, vec2, vec3, vec4 } from "gl-matrix";

import type { Context } from "../context";
import type { Mesh, Object as Object_, Properties, Layer, LayerOptions } from ".";
import { createDynamicContainer } from "./container";
import { createObjectLayer } from "./object";

export type Gltf = {
  url: string;
  position: vec3;
  orientation: quat;
  color?: vec4;
  diffuse?: vec4;
  size?: number;
  minSizePixels?: number;
  maxSizePixels?: number;
} & LayerOptions;

export const createGltfLayer = (
  context: Context,
  properties: Properties<Partial<Gltf>>,
) => {
  let parts: { mesh: Mesh; textureUrl?: string }[] = [];
  let lastUrl: string | undefined;

  const container = createDynamicContainer({
    keys: () => parts.map((_, i) => i),
    create: i => createObjectLayer(context, {
      ...properties,
      mesh: () => parts[i]?.mesh,
      textureUrl: () => parts[i]?.textureUrl,
    } as Properties<Partial<Object_>>),
  });

  const update = () => {
    const url = properties.url?.();
    if (!url || url === lastUrl) return;
    lastUrl = url;
    void loadGltfParts(url).then(_ => { parts = _; }).catch(() => { parts = []; });
  };

  const render: Layer["render"] = () => {
    update();
    container.render?.();
  };

  const dispose = () => {
    container.dispose();
  };

  return {
    get children() { return container.children; },
    render,
    dispose,
  } satisfies Layer;
};

export const loadGltf = async (
  url: string,
): Promise<{ mesh: Mesh; textureUrl?: string }> => {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  // GLB magic 0x46546C67 (glTF)
  const view = new DataView(buffer, 0, 12);
  const magic = view.getUint32(0, true);
  if (magic === 0x46546c67) {
    const { json, bin } = parseGlb(buffer);
    const base = urlBase(url);
    const parts = await parseGltfJsonToParts(json, base, bin);
    return parts[0] ?? { mesh: { vertices: [], indices: [], normals: [], uvs: [] } };
  }

  // JSON glTF
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer))) as GltfJson;
  const base = urlBase(url);
  const parts = await parseGltfJsonToParts(json, base);
  return parts[0] ?? { mesh: { vertices: [], indices: [], normals: [], uvs: [] } };
};

const parseGlb = (ab: ArrayBuffer): { json: GltfJson; bin?: ArrayBuffer } => {
  const dv = new DataView(ab);
  const version = dv.getUint32(4, true);
  if (version !== 2) throw new Error("Only glTF 2.0 is supported");
  const length = dv.getUint32(8, true);
  let offset = 12;
  let json: GltfJson | undefined;
  let bin: ArrayBuffer | undefined;
  while (offset + 8 <= length) {
    const chunkLength = dv.getUint32(offset, true); offset += 4;
    const chunkType = dv.getUint32(offset, true); offset += 4;
    const chunkData = ab.slice(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === 0x4e4f534a) { // JSON
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(chunkData))) as GltfJson;
    } else if (chunkType === 0x004e4942) { // BIN
      bin = chunkData;
    }
  }
  if (!json) throw new Error("Invalid GLB");
  return { json, bin };
};

type GltfJson = {
  buffers?: { uri?: string; byteLength: number }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: "SCALAR"|"VEC2"|"VEC3"|"VEC4" }[];
  images?: { uri?: string; bufferView?: number; mimeType?: string }[];
  textures?: { source?: number }[];
  materials?: { pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }[] }[];
};

export const loadGltfParts = async (url: string): Promise<{ mesh: Mesh; textureUrl?: string }[]> => {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer, 0, 12);
  const magic = view.getUint32(0, true);
  if (magic === 0x46546c67) {
    const { json, bin } = parseGlb(buffer);
    const base = urlBase(url);
    const parts = await parseGltfJsonToParts(json, base, bin);
    return parts;
  }
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer))) as GltfJson;
  const base = urlBase(url);
  const parts = await parseGltfJsonToParts(json, base);
  return parts;
};

const parseGltfJsonToParts = async (
  json: GltfJson,
  baseUrl: string,
  glbBin?: ArrayBuffer,
): Promise<{ mesh: Mesh; textureUrl?: string }[]> => {
  const buffers: ArrayBuffer[] = [];
  // buffers
  if (json.buffers && json.buffers.length > 0) {
    for (let i = 0; i < json.buffers.length; i++) {
      const b = json.buffers[i]!;
      if (b.uri) buffers[i] = await loadBuffer(resolveUri(baseUrl, b.uri));
      else if (glbBin) buffers[i] = glbBin;
      else throw new Error("Missing buffer data");
    }
  } else if (glbBin) {
    buffers[0] = glbBin;
  } else {
    throw new Error("No buffers");
  }

  const parts: { mesh: Mesh; textureUrl?: string }[] = [];
  const meshes = json.meshes ?? [];
  for (const m of meshes) {
    for (const prim of m.primitives) {
      if (prim.mode !== undefined && prim.mode !== 4 /* TRIANGLES */) continue;
      const posAcc = prim.attributes!["POSITION"]!;
      if (posAcc === undefined) continue;
      const normAcc = prim.attributes!["NORMAL"];
      const uvAcc = prim.attributes!["TEXCOORD_0"];
      const idxAcc = prim.indices;

      const positions = readAccessor(json, buffers, posAcc) as Float32Array;
      const vertices: vec3[] = [];
      for (let i = 0; i < positions.length; i += 3) vertices.push([positions[i]!, positions[i+1]!, positions[i+2]!]);

      const normalsRaw = normAcc !== undefined ? readAccessor(json, buffers, normAcc) as Float32Array : undefined;
      const normals: vec3[] = normalsRaw ? (() => { const arr: vec3[] = []; for (let i = 0; i < normalsRaw.length; i += 3) arr.push([normalsRaw[i]!, normalsRaw[i+1]!, normalsRaw[i+2]!!]); return arr; })() : [];

      const uvsRaw = uvAcc !== undefined ? readAccessor(json, buffers, uvAcc) as Float32Array : undefined;
      const uvs: vec2[] | undefined = uvsRaw ? (() => { const arr: vec2[] = []; for (let i = 0; i < uvsRaw.length; i += 2) arr.push([uvsRaw[i]!, uvsRaw[i+1]!!]); return arr; })() : undefined;

      const indicesArr = idxAcc !== undefined ? readAccessor(json, buffers, idxAcc) as Uint16Array | Uint32Array | Uint8Array : undefined;
      let indices: vec3[] = [];
      if (indicesArr) {
        const maxIndex = Math.max(...Array.from(indicesArr as Iterable<number>));
        if (maxIndex > 65535) continue; // skip unsupported large index primitives
        for (let i = 0; i < (indicesArr as any).length; i += 3) indices.push([(indicesArr as any)[i], (indicesArr as any)[i+1], (indicesArr as any)[i+2]]);
      } else {
        for (let i = 0; i < vertices.length; i += 3) indices.push([i, i+1, i+2]);
      }

      let textureUrl: string | undefined;
      const mat = prim.material !== undefined ? json.materials?.[prim.material]! : undefined;
      const tex = mat?.pbrMetallicRoughness?.baseColorTexture?.index;
      const imgIndex = tex !== undefined ? json.textures?.[tex]?.source : undefined;
      const img = imgIndex !== undefined ? json.images?.[imgIndex] : undefined;
      if (img?.uri) textureUrl = resolveUri(baseUrl, img.uri);
      else if (img?.bufferView !== undefined) {
        const bv = json.bufferViews?.[img.bufferView];
        if (bv) {
          const bin = buffers[bv.buffer]!;
          const start = (bv.byteOffset ?? 0);
          const end = start + bv.byteLength;
          const slice = bin.slice(start, end);
          const mime = img.mimeType ?? "image/png";
          const base64 = arrayBufferToBase64(slice);
          textureUrl = `data:${mime};base64,${base64}`;
        }
      }

      parts.push({ mesh: { vertices, indices, normals, uvs }, textureUrl });
    }
  }

  if (parts.length === 0) throw new Error("No drawable primitives");
  return parts;
};

const COMPONENT_TYPE_BYTES: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

const readAccessor = (
  json: GltfJson,
  buffers: ArrayBuffer[],
  accessorIndex: number,
): Uint8Array | Uint16Array | Uint32Array | Float32Array => {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new Error("Accessor not found");
  const bufferView = accessor.bufferView !== undefined ? json.bufferViews?.[accessor.bufferView] : undefined;
  if (!bufferView) throw new Error("BufferView not found");
  const buffer = buffers[bufferView.buffer]!;
  const componentBytes = COMPONENT_TYPE_BYTES[accessor.componentType]!;
  const components = TYPE_COMPONENTS[accessor.type]!;
  const stride = bufferView.byteStride ?? (componentBytes * components);
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  if (stride === componentBytes * components) {
    const byteOffset = base;
    const byteLength = accessor.count * componentBytes * components;
    const slice = buffer.slice(byteOffset, byteOffset + byteLength);
    switch (accessor.componentType) {
      case 5121: return new Uint8Array(slice);
      case 5123: return new Uint16Array(slice);
      case 5125: return new Uint32Array(slice);
      case 5126: return new Float32Array(slice);
      case 5120: return new Uint8Array(slice);
      case 5122: return new Uint16Array(slice);
      default: throw new Error("Unsupported componentType");
    }
  }
  // Interleaved: deinterleave to packed array
  const totalBytes = accessor.count * componentBytes * components;
  const dst = new Uint8Array(totalBytes);
  const src = new Uint8Array(buffer);
  for (let i = 0; i < accessor.count; i++) {
    const so = base + i * stride;
    const doff = i * componentBytes * components;
    dst.set(src.subarray(so, so + componentBytes * components), doff);
  }
  switch (accessor.componentType) {
    case 5121: return new Uint8Array(dst.buffer);
    case 5123: return new Uint16Array(dst.buffer);
    case 5125: return new Uint32Array(dst.buffer);
    case 5126: return new Float32Array(dst.buffer);
    case 5120: return new Uint8Array(dst.buffer);
    case 5122: return new Uint16Array(dst.buffer);
    default: throw new Error("Unsupported componentType");
  }
};

const loadBuffer = async (uri: string): Promise<ArrayBuffer> => {
  if (uri.startsWith("data:")) return decodeDataUri(uri);
  const res = await fetch(uri);
  return res.arrayBuffer();
};

const decodeDataUri = (uri: string): ArrayBuffer => {
  const comma = uri.indexOf(",");
  const meta = uri.substring(5, comma); // skip "data:"
  if (!meta.includes("base64")) throw new Error("Only base64 data URIs supported");
  const data = uri.substring(comma + 1);
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const arrayBufferToBase64 = (ab: ArrayBuffer) => {
  const bytes = new Uint8Array(ab);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
};

const urlBase = (u: string) => {
  try {
    const url = new URL(u, window.location.href);
    url.pathname = url.pathname.replace(/[^/]*$/, "");
    return url.toString();
  } catch {
    const i = u.lastIndexOf("/");
    return i >= 0 ? u.substring(0, i + 1) : "";
  }
};

const resolveUri = (base: string, relative: string) => {
  try {
    return new URL(relative, base).toString();
  } catch {
    if (!base) return relative;
    if (base.endsWith("/")) return base + relative;
    return base + "/" + relative;
  }
};


