import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { INITIAL_PRODUCTS } from '../../data/initialData';
import { ProductCard } from './ProductCard';

describe('foto produk POS', () => {
  it('menampilkan foto opsional dari snapshot master produk', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...INITIAL_PRODUCTS[0], name: 'Latte', imageUrl: 'https://images.test/latte.webp' }} categoryIcon="CupSoda" onSelect={() => {}} />);
    expect(html).toContain('<img');
    expect(html).toContain('https://images.test/latte.webp');
    expect(html).toContain('alt="Latte"');
  });
  it('memakai ikon kategori ketika foto tidak diisi', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...INITIAL_PRODUCTS[0], imageUrl: undefined }} categoryIcon="Cookie" onSelect={() => {}} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('lucide-cookie');
  });
});
