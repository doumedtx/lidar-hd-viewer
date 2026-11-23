export interface LasClassInfo {
  name: string;
  color: number;
}

const CLASS_TABLE: Record<number, LasClassInfo> = {
  0: { name: 'Jamais classé', color: 0x9e9e9e },
  1: { name: 'Non classé', color: 0xbdbdbd },
  2: { name: 'Sol', color: 0xb0703f },
  3: { name: 'Végétation basse', color: 0x9ccc65 },
  4: { name: 'Végétation moyenne', color: 0x558b2f },
  5: { name: 'Végétation haute', color: 0x2e7d32 },
  6: { name: 'Bâtiment', color: 0xe05a4e },
  7: { name: 'Point bas (bruit)', color: 0x4d4d4d },
  8: { name: 'Point clé (sol modèle)', color: 0x8d6e63 },
  9: { name: 'Eau', color: 0x2196f3 },
  10: { name: 'Rail', color: 0x4dd0e1 },
  11: { name: 'Surface routière', color: 0xffb74d },
  12: { name: 'Barrière', color: 0xcfd8dc },
  13: { name: 'Câble (enveloppe)', color: 0xba68c8 },
  14: { name: 'Câble (conducteur)', color: 0xab47bc },
  15: { name: 'Pylné / tour', color: 0x7e57c2 },
  16: { name: 'Câble (connecteur)', color: 0x9575cd },
  17: { name: 'Tablier de pont', color: 0xd4e157 },
  18: { name: 'Bruit élevé', color: 0xf06292 }
};

export const DEFAULT_CLASS_COLOR = 0x808080;
export const DEFAULT_CLASS_NAME = 'Autre';
export const MAX_PALETTE_CLASSES = 32;

export function classInfo(value: number): LasClassInfo {
  return CLASS_TABLE[value] ?? { name: DEFAULT_CLASS_NAME, color: DEFAULT_CLASS_COLOR };
}

export function hexColor(value: number): string {
  return '#' + value.toString(16).padStart(6, '0');
}
