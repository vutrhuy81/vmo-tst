import '../geometry_diagram.js';

export const cleanGeometryDiagram = globalThis.MathAppGeometry.clean;
const str = { type: 'string' }, num = { type: 'number' }, bool = { type: 'boolean' };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const list = items => ({ type: 'array', items });
export const geometrySchema = object({
  isGeometry: bool, caption: str,
  points: list(object({ id: str, x: num, y: num })),
  segments: list(object({ from: str, to: str, auxiliary: bool })),
  circles: list(object({ center: str, through: str, auxiliary: bool })),
  constraints: list(object({ type: { type: 'string', enum: ['collinear', 'perpendicular', 'parallel', 'equalLength', 'midpoint', 'onCircle'] }, points: list(str) }))
});
export const geometryInstruction = `For a planar geometry problem, provide geometry with isGeometry=true and an accurate coordinate diagram consistent with the STATEMENT and the solution, including auxiliary constructions used in the proof. Use at most 40 labeled points, 80 segments, 12 circles and 100 constraints. Coordinates are finite numbers of magnitude <=10000, in a nondegenerate representative configuration. Labels are ASCII identifiers (A, B, O, H, A1, A'). Circles use center and through point IDs; auxiliary constructions have auxiliary=true. Include ALL relevant geometric hypotheses and constructions as numerical constraints, never a token unrelated constraint: collinear[A,B,C]; perpendicular[A,B,C,D] for AB perpendicular CD; parallel[A,B,C,D]; equalLength[A,B,C,D]; midpoint[M,A,B]; onCircle[P,O,R] for OP=OR. Coordinates must satisfy these constraints within normalized tolerance 0.0001. Do not assume extra symmetries, right angles or equal lengths. Caption in the output language explains the configuration. Do not output SVG, HTML, URLs, code or images. For nongeometry problems or a configuration you cannot faithfully represent (including spatial geometry), use isGeometry=false, empty caption and empty arrays. A diagram is illustrative, never a substitute for proof.`;
// Diagram acceptance is separate from mathematical proof approval.
export function selectGuideGeometry(candidate, audit, repaired, topic = '') {
  const geometry = repaired ? audit.correctedGeometry : candidate.geometry;
  const approved = repaired ? audit.correctedGeometryApproved : audit.geometryApproved;
  return {
    geometryRequested: candidate.geometry?.isGeometry === true || geometry?.isGeometry === true || /hình học|geometry/i.test(topic),
    geometry: approved === true ? cleanGeometryDiagram(geometry) : null
  };
}
