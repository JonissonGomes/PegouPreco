export const primary = {
  red: '#E11D2E',
  yellow: '#FFD400',
  blue: '#1D4ED8',
};

export const primaryCycle = [primary.red, primary.yellow, primary.blue];

export function primaryAt(index: number): string {
  return primaryCycle[index % primaryCycle.length];
}
