import React from 'react';

interface HarmonizedFoodData {
  name: string;
  calories: number;
  nutrients: Array<{ name: string; value: number; unit: string }>;
}

interface HarmonizedFoodDisplayProps {
  data: HarmonizedFoodData;
}

export const HarmonizedFoodDisplay: React.FC<HarmonizedFoodDisplayProps> = ({ data }) => {
  return (
    <div className="p-4 border rounded-lg shadow-sm">
      <h2 className="text-xl font-semibold mb-2">{data.name}</h2>
      <p className="text-muted-foreground mb-3">{data.calories} calories</p>
      <div className="space-y-1">
        <h3 className="text-lg font-medium">Nutrients:</h3>
        {data.nutrients.length > 0 ? (
          <ul>
            {data.nutrients.map((nutrient, index) => (
              <li key={index} className="text-sm text-muted-foreground">
                {nutrient.name}: {nutrient.value}
                {nutrient.unit}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No detailed nutrient information available.</p>
        )}
      </div>
    </div>
  );
};
