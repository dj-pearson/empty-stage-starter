import { QuizQuestion as QuizQuestionType } from '@/types/quiz';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface QuizQuestionProps {
  question: QuizQuestionType;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}

export function QuizQuestion({ question, value, onChange }: QuizQuestionProps) {
  const handleSingleChange = (newValue: string) => {
    onChange(newValue);
  };

  const handleMultipleChange = (optionValue: string, checked: boolean) => {
    const currentValues = (value as string[]) || [];
    if (checked) {
      onChange([...currentValues, optionValue]);
    } else {
      onChange(currentValues.filter(v => v !== optionValue));
    }
  };

  // Single choice question
  if (question.type === 'single') {
    return (
      <RadioGroup value={value as string} onValueChange={handleSingleChange}>
        <div className="space-y-3">
          {question.options.map(option => (
            <Card
              key={option.id}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md border-2',
                value === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 dark:border-gray-700'
              )}
              onClick={() => handleSingleChange(option.value)}
            >
              <div className="flex items-center space-x-3 p-4">
                <RadioGroupItem value={option.value} id={option.id} />
                <Label
                  htmlFor={option.id}
                  className="flex-1 cursor-pointer flex items-center gap-3"
                >
                  {option.icon && <span className="text-2xl">{option.icon}</span>}
                  <div className="flex-1">
                    <div className="font-medium">{option.label}</div>
                    {option.description && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {option.description}
                      </div>
                    )}
                  </div>
                </Label>
              </div>
            </Card>
          ))}
        </div>
      </RadioGroup>
    );
  }

  // Multiple choice question
  if (question.type === 'multiple') {
    const selectedValues = (value as string[]) || [];

    return (
      <div className="space-y-3">
        {question.options.map(option => {
          const isChecked = selectedValues.includes(option.value);

          return (
            <Card
              key={option.id}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md border-2',
                isChecked
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 dark:border-gray-700'
              )}
              onClick={() => handleMultipleChange(option.value, !isChecked)}
            >
              <div className="flex items-center space-x-3 p-4">
                <Checkbox
                  id={option.id}
                  checked={isChecked}
                  onCheckedChange={(checked) =>
                    handleMultipleChange(option.value, checked as boolean)
                  }
                />
                <Label
                  htmlFor={option.id}
                  className="flex-1 cursor-pointer flex items-center gap-3"
                >
                  {option.icon && <span className="text-2xl">{option.icon}</span>}
                  <div className="flex-1">
                    <div className="font-medium">{option.label}</div>
                    {option.description && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {option.description}
                      </div>
                    )}
                  </div>
                </Label>
              </div>
            </Card>
          );
        })}
        <p className="text-sm text-gray-600 dark:text-gray-400 italic">
          Select all that apply
        </p>
      </div>
    );
  }

  // Visual choice question (grid layout with larger cards)
  if (question.type === 'visual') {
    return (
      <RadioGroup value={value as string} onValueChange={handleSingleChange}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {question.options.map(option => (
            <Card
              key={option.id}
              className={cn(
                'cursor-pointer transition-all hover:shadow-lg hover:scale-105 border-2',
                value === option.value
                  ? 'border-primary bg-primary/10 shadow-lg'
                  : 'border-gray-200 dark:border-gray-700'
              )}
              onClick={() => handleSingleChange(option.value)}
            >
              <div className="p-6 text-center">
                <RadioGroupItem
                  value={option.value}
                  id={option.id}
                  className="sr-only"
                />
                {option.icon && (
                  <div className="text-5xl mb-3">{option.icon}</div>
                )}
                <Label
                  htmlFor={option.id}
                  className="cursor-pointer block"
                >
                  <div className="font-semibold text-lg mb-1">{option.label}</div>
                  {option.description && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {option.description}
                    </div>
                  )}
                </Label>
              </div>
            </Card>
          ))}
        </div>
      </RadioGroup>
    );
  }

  return null;
}
