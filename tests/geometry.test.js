import { describe, expect, it } from 'vitest';
import { midpoint, partialPolyline, polylineLength, projectOnSegment, segmentIntersection, simplify } from '../src/lib/geometry.js';

const P = (x, y) => ({ x, y });

describe('geometry', () => {
  it('segmentIntersection: 交わる/交わらない/平行', () => {
    const hit = segmentIntersection(P(0, 0), P(10, 10), P(0, 10), P(10, 0));
    expect(hit.point.x).toBeCloseTo(5);
    expect(hit.t).toBeCloseTo(0.5);
    expect(segmentIntersection(P(0, 0), P(4, 4), P(6, 0), P(10, -4))).toBeNull();
    expect(segmentIntersection(P(0, 0), P(10, 0), P(0, 1), P(10, 1))).toBeNull();
  });

  it('projectOnSegment は線分の外では端に寄せる', () => {
    expect(projectOnSegment(P(5, 3), P(0, 0), P(10, 0))).toMatchObject({ t: 0.5, d: 3 });
    expect(projectOnSegment(P(-5, 0), P(0, 0), P(10, 0)).t).toBe(0);
  });

  it('simplify は直線上の点を落とし、角は残す', () => {
    const pts = [P(0, 0), P(1, 0.1), P(2, 0), P(3, 0.1), P(4, 0), P(4, 4)];
    expect(simplify(pts, 0.5)).toEqual([P(0, 0), P(4, 0), P(4, 4)]);
  });

  it('partialPolyline / midpoint', () => {
    const pts = [P(0, 0), P(10, 0), P(10, 10)];
    expect(polylineLength(pts)).toBe(20);
    expect(partialPolyline(pts, 15).at(-1)).toEqual(P(10, 5));
    expect(midpoint(pts)).toEqual(P(10, 0));
    expect(partialPolyline(pts, 99)).toHaveLength(3);
  });
});
