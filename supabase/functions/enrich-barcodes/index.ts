import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function searchBarcodeByName(name: string): Promise<string | null> {
  console.log(`Searching barcode for: ${name}`);
  
  try {
    // Search Open Food Facts by product name
    const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name)}&search_simple=1&action=process&json=1`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (data.products && data.products.length > 0) {
      const product = data.products[0];
      if (product.code) {
        console.log(`Found barcode ${product.code} for ${name}`);
        return product.code;
      }
    }
  } catch (error) {
    console.error(`Error searching barcode for ${name}:`, error);
  }
  
  return null;
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { table } = await req.json();
    
    if (!table || !['foods', 'nutrition'].includes(table)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid table specified. Must be "foods" or "nutrition"' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Enriching barcodes for table: ${table}`);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get all items without barcodes
    const { data: items, error: fetchError } = await supabaseClient
      .from(table)
      .select('id, name, barcode')
      .is('barcode', null)
      .limit(100); // Process in batches

    if (fetchError) {
      console.error('Error fetching items:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No items without barcodes found',
          processed: 0,
          found: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${items.length} items without barcodes`);

    let found = 0;
    const updates = [];

    // Search for barcodes
    for (const item of items) {
      const barcode = await searchBarcodeByName(item.name);
      if (barcode) {
        updates.push({ id: item.id, barcode });
        found++;
      }
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Found ${found} barcodes out of ${items.length} items`);

    // Update items with found barcodes
    for (const update of updates) {
      const { error: updateError } = await supabaseClient
        .from(table)
        .update({ barcode: update.barcode })
        .eq('id', update.id);

      if (updateError) {
        console.error(`Error updating item ${update.id}:`, updateError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        processed: items.length,
        found: found,
        message: `Processed ${items.length} items, found ${found} barcodes`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error enriching barcodes:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}
