import localFont from 'next/font/local';

/* Self-hosted OFL fonts (latin subsets, licences in public/fonts). Body text stays on the system font. */

/** Hand-lettered display: large titles. */
export const amatic = localFont({
  src: '../public/fonts/AmaticSC-Bold-latin.woff2',
  weight: '700',
  variable: '--font-amatic',
  display: 'swap',
});

/** Handwriting: section labels, annotations. */
export const caveat = localFont({
  src: '../public/fonts/Caveat-Variable-latin.woff2',
  weight: '400 700',
  variable: '--font-caveat',
  display: 'swap',
});

/** Serif accents. */
export const instrument = localFont({
  src: [
    { path: '../public/fonts/InstrumentSerif-Regular-latin.woff2', style: 'normal' },
    { path: '../public/fonts/InstrumentSerif-Italic-latin.woff2', style: 'italic' },
  ],
  weight: '400',
  variable: '--font-instrument',
  display: 'swap',
});

export const fontVariables = `${amatic.variable} ${caveat.variable} ${instrument.variable}`;
