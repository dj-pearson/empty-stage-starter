import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HarmonizedFoodDisplay } from './HarmonizedFoodDisplay';
import React from 'react';

describe('HarmonizedFoodDisplay', () => {
  it('should display the harmonized food data correctly', () => {
    const sampleData = {
      name: 'Apple',
      calories: 95,
      nutrients: [
        { name: 'Fiber', value: 4, unit: 'g' },
        { name: 'Protein', value: 0.5, unit: 'g' },
      ],
    };

    render(<HarmonizedFoodDisplay data={sampleData} />);

    // Check food name
    expect(screen.getByText('Apple')).toBeInTheDocument();

    // Check calories
    expect(screen.getByText('95 calories')).toBeInTheDocument();

    // Check nutrients
    expect(screen.getByText('Fiber: 4g')).toBeInTheDocument();
    expect(screen.getByText('Protein: 0.5g')).toBeInTheDocument();
  });
});
