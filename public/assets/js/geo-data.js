/**
 * geo-data.js
 * Country and city data for the customer registration form.
 * Focused on Philippines and Japan (primary markets),
 * plus a curated global list for international clients.
 */

const GEO_DATA = {

  countries: [
    { code: 'PH', name: 'Philippines', phone: '+63' },
    { code: 'JP', name: 'Japan',       phone: '+81' },
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'AU', name: 'Australia' },
    { code: 'CA', name: 'Canada' },
    { code: 'SG', name: 'Singapore' },
    { code: 'MY', name: 'Malaysia' },
    { code: 'ID', name: 'Indonesia' },
    { code: 'TH', name: 'Thailand' },
    { code: 'VN', name: 'Vietnam' },
    { code: 'KR', name: 'South Korea' },
    { code: 'CN', name: 'China' },
    { code: 'IN', name: 'India' },
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'SA', name: 'Saudi Arabia' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'OTHER', name: 'Other' },
  ],

  cities: {
    PH: [
      // NCR
      'Manila', 'Quezon City', 'Makati', 'Pasig', 'Taguig',
      'Mandaluyong', 'Marikina', 'Parañaque', 'Las Piñas',
      'Muntinlupa', 'Caloocan', 'Malabon', 'Navotas', 'Valenzuela',
      'Pasay', 'Pateros', 'San Juan',
      // Luzon
      'Antipolo', 'Cainta', 'Taytay', 'Angeles City', 'San Fernando (Pampanga)',
      'Olongapo', 'Batangas City', 'Lipa', 'Lucena', 'Dasmariñas',
      'Bacoor', 'Imus', 'General Trias', 'Cavite City', 'Tagaytay',
      'San Jose del Monte', 'Malolos', 'Meycauayan', 'Marilao',
      'Baguio', 'San Fernando (La Union)', 'Dagupan', 'Laoag',
      'Vigan', 'Tuguegarao', 'Cauayan', 'Ilagan',
      'Naga City', 'Legazpi', 'Sorsogon City',
      // Visayas
      'Cebu City', 'Mandaue', 'Lapu-Lapu', 'Talisay (Cebu)',
      'Iloilo City', 'Bacolod', 'Dumaguete', 'Tagbilaran',
      'Tacloban', 'Ormoc', 'Calbayog',
      // Mindanao
      'Davao City', 'General Santos', 'Cagayan de Oro',
      'Zamboanga City', 'Iligan', 'Butuan', 'Cotabato City',
      'Malaybalay', 'Valencia City', 'Pagadian', 'Dipolog',
      'Koronadal', 'Digos', 'Tagum', 'Panabo',
      'Other',
    ],

    JP: [
      // Tokyo & Kanto
      'Tokyo (Chiyoda)', 'Tokyo (Shinjuku)', 'Tokyo (Shibuya)',
      'Tokyo (Minato)', 'Tokyo (Sumida)', 'Tokyo (Koto)',
      'Tokyo (Setagaya)', 'Tokyo (Nerima)', 'Tokyo (Adachi)',
      'Yokohama', 'Kawasaki', 'Sagamihara', 'Chiba',
      'Saitama', 'Funabashi', 'Hachioji',
      // Kansai
      'Osaka', 'Kyoto', 'Kobe', 'Nara', 'Otsu',
      'Sakai', 'Higashiosaka', 'Hirakata',
      // Chubu
      'Nagoya', 'Shizuoka', 'Hamamatsu', 'Kanazawa',
      'Toyama', 'Fukui', 'Gifu',
      // Tohoku
      'Sendai', 'Morioka', 'Aomori', 'Akita', 'Yamagata', 'Fukushima',
      // Hokkaido
      'Sapporo', 'Asahikawa', 'Hakodate', 'Obihiro', 'Kushiro',
      // Chugoku & Shikoku
      'Hiroshima', 'Okayama', 'Matsue', 'Tottori',
      'Matsuyama', 'Takamatsu', 'Tokushima', 'Kochi',
      // Kyushu & Okinawa
      'Fukuoka', 'Kitakyushu', 'Kumamoto', 'Kagoshima',
      'Nagasaki', 'Oita', 'Miyazaki', 'Saga',
      'Naha (Okinawa)',
      'Other',
    ],

    // Generic fallback for all other countries
    DEFAULT: [
      'Capital / Main City',
      'Other',
    ],
  },

  /**
   * Get cities for a given country code.
   * Falls back to DEFAULT list if no specific list exists.
   */
  getCities(countryCode) {
    return this.cities[countryCode] || this.cities.DEFAULT;
  },
};
