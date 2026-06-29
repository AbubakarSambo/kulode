import { describe, it, expect } from 'vitest';
import { parseSemVer, isNewerVersion } from '../lib/semver';

describe('SemVer Utility', () => {
  describe('parseSemVer', () => {
    it('should parse standard semver strings', () => {
      expect(parseSemVer('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
      expect(parseSemVer('v2.10.15')).toEqual({ major: 2, minor: 10, patch: 15 });
    });

    it('should default missing fields to 0', () => {
      expect(parseSemVer('1')).toEqual({ major: 1, minor: 0, patch: 0 });
      expect(parseSemVer('1.5')).toEqual({ major: 1, minor: 5, patch: 0 });
      expect(parseSemVer('')).toEqual({ major: 0, minor: 0, patch: 0 });
    });
  });

  describe('isNewerVersion', () => {
    it('should correctly compare major versions', () => {
      expect(isNewerVersion('1.0.0', '2.0.0')).toBe(true);
      expect(isNewerVersion('2.0.0', '1.0.0')).toBe(false);
    });

    it('should correctly compare minor versions', () => {
      expect(isNewerVersion('1.2.0', '1.10.0')).toBe(true);
      expect(isNewerVersion('1.10.0', '1.2.0')).toBe(false);
    });

    it('should correctly compare patch versions', () => {
      expect(isNewerVersion('1.2.3', '1.2.4')).toBe(true);
      expect(isNewerVersion('1.2.4', '1.2.3')).toBe(false);
    });

    it('should return false for equal versions', () => {
      expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
    });
  });
});
