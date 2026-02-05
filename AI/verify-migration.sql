-- Quick check to see if the new tables exist and have data

-- Check if ai_model_configurations table exists and has data
SELECT 
  'ai_model_configurations' as table_name,
  COUNT(*) as row_count,
  COUNT(*) FILTER (WHERE task_type = 'standard') as standard_models,
  COUNT(*) FILTER (WHERE task_type = 'lightweight') as lightweight_models
FROM ai_model_configurations;

-- Check if ai_environment_config table exists and has data
SELECT 
  'ai_environment_config' as table_name,
  COUNT(*) as row_count,
  COUNT(*) FILTER (WHERE is_required = true) as required_vars,
  COUNT(*) FILTER (WHERE is_required = false) as optional_vars
FROM ai_environment_config;

-- Show all environment configs
SELECT config_key, coolify_variable, is_required, default_value
FROM ai_environment_config
ORDER BY is_required DESC, config_key;

-- Show all AI models
SELECT provider, model_name, model_display_name, task_type, is_active
FROM ai_model_configurations
ORDER BY task_type, is_active DESC;
