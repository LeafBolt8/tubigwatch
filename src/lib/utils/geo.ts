export const CITY_COORDS: Record<string, [number, number]> = {
  'Quezon City': [14.676, 121.0437],
  'Manila': [14.5995, 120.9842],
  'Caloocan': [14.6507, 120.9675],
  'Caloocan City': [14.6507, 120.9675],
  'Makati': [14.5547, 121.0244],
  'Taguig': [14.5176, 121.0509],
  'Pasig': [14.5764, 121.0851],
  'Pasig City': [14.5764, 121.0851],
  'Valenzuela': [14.7011, 120.983],
  'Valenzuela City': [14.7011, 120.983],
  'Parañaque': [14.4791, 121.0198],
  'Parañaque City': [14.4791, 121.0198],
  'Las Piñas': [14.4498, 120.983],
  'Muntinlupa': [14.4081, 121.0415],
  'Muntinlupa City': [14.4081, 121.0415],
  'Marikina': [14.6507, 121.1029],
  'Marikina City': [14.6507, 121.1029],
  'Pasay': [14.5378, 121.0014],
  'Malabon': [14.6624, 120.9569],
  'Navotas': [14.6667, 120.9417],
  'Navotas City': [14.6667, 120.9417],
  'San Juan': [14.6019, 121.0356],
  'Mandaluyong': [14.5794, 121.0359],
  'Imus': [14.4297, 120.9367],
  'Imus City': [14.4297, 120.9367],
  'Bacoor': [14.4624, 120.9645],
  'Bacoor City': [14.4624, 120.9645],
  'Cavite City': [14.4791, 120.8969],
  'Dasmariñas': [14.3294, 120.9367],
  'Antipolo': [14.5888, 121.1768],
  'Antipolo City': [14.5888, 121.1768],
  'Antipolo, Rizal': [14.5888, 121.1768],
  'Rodriguez, Rizal': [14.7333, 121.1333],
  'San Mateo, Rizal': [14.6981, 121.1225],
  'Angono, Rizal': [14.5255, 121.1535],
  'Cainta': [14.5778, 121.1142],
  'Taytay': [14.5688, 121.1318],
  'Taytay, Rizal': [14.5688, 121.1318],
  'Bacoor, Cavite': [14.4624, 120.9645],
  'Imus, Cavite': [14.4297, 120.9367],
};

// Metro Manila covers a small enough area that squared-degree distance ranks the
// candidate cities correctly, so there is no need to project to real metres.
export function getClosestCity(lat: number, lng: number): string | null {
  let closestCity: string | null = null;
  let minDistance = Infinity;

  for (const [city, [cityLat, cityLng]] of Object.entries(CITY_COORDS)) {
    const distance = Math.pow(lat - cityLat, 2) + Math.pow(lng - cityLng, 2);
    if (distance < minDistance) {
      minDistance = distance;
      closestCity = city;
    }
  }

  return closestCity;
}
