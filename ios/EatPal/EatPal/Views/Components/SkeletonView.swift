import SwiftUI

/// Reusable skeleton view with configurable shapes for loading states.
enum SkeletonShape {
    case foodRow
    case recipeRow
    case mealSlotCard
    case groceryRow
    case card
    case text(lines: Int)
}

struct SkeletonView: View {
    let shape: SkeletonShape

    var body: some View {
        switch shape {
        case .foodRow:
            FoodRowSkeleton()
        case .recipeRow:
            RecipeRowSkeleton()
        case .mealSlotCard:
            MealSlotSkeleton()
        case .groceryRow:
            GroceryRowSkeleton()
        case .card:
            CardSkeleton()
        case .text(let lines):
            TextSkeleton(lines: lines)
        }
    }
}

// MARK: - Food Row Skeleton

private struct FoodRowSkeleton: View {
    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 6)
                .fill(Color(.systemGray5))
                .frame(width: 36, height: 36)
                .shimmer()

            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color(.systemGray5))
                    .frame(width: 120, height: 14)
                    .shimmer()

                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(.systemGray6))
                        .frame(width: 50, height: 10)
                        .shimmer()
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(.systemGray6))
                        .frame(width: 70, height: 10)
                        .shimmer()
                }
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Recipe Row Skeleton

private struct RecipeRowSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(.systemGray5))
                    .frame(width: 44, height: 44)
                    .shimmer()

                VStack(alignment: .leading, spacing: 6) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(.systemGray5))
                        .frame(width: 160, height: 14)
                        .shimmer()
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(.systemGray6))
                        .frame(width: 200, height: 10)
                        .shimmer()
                }
                Spacer()
            }

            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(.systemGray6))
                    .frame(width: 60, height: 16)
                    .shimmer()
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(.systemGray6))
                    .frame(width: 50, height: 16)
                    .shimmer()
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(.systemGray6))
                    .frame(width: 80, height: 16)
                    .shimmer()
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Meal Slot Skeleton

private struct MealSlotSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray5))
                    .frame(width: 20, height: 20)
                    .shimmer()
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color(.systemGray5))
                    .frame(width: 80, height: 16)
                    .shimmer()
                Spacer()
            }

            ForEach(0..<2, id: \.self) { _ in
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray6))
                        .frame(width: 24, height: 24)
                        .shimmer()
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(.systemGray6))
                        .frame(width: 100, height: 12)
                        .shimmer()
                    Spacer()
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(.systemGray6))
                        .frame(width: 40, height: 24)
                        .shimmer()
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Grocery Row Skeleton

private struct GroceryRowSkeleton: View {
    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color(.systemGray5))
                .frame(width: 24, height: 24)
                .shimmer()

            VStack(alignment: .leading, spacing: 4) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color(.systemGray5))
                    .frame(width: 130, height: 14)
                    .shimmer()
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color(.systemGray6))
                    .frame(width: 60, height: 10)
                    .shimmer()
            }

            Spacer()
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Card Skeleton

private struct CardSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            RoundedRectangle(cornerRadius: 3)
                .fill(Color(.systemGray5))
                .frame(height: 16)
                .shimmer()
            RoundedRectangle(cornerRadius: 3)
                .fill(Color(.systemGray6))
                .frame(height: 12)
                .shimmer()
            RoundedRectangle(cornerRadius: 3)
                .fill(Color(.systemGray6))
                .frame(width: 180, height: 12)
                .shimmer()
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Text Skeleton

private struct TextSkeleton: View {
    let lines: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(0..<lines, id: \.self) { index in
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color(.systemGray5))
                    .frame(width: index == lines - 1 ? 160 : .infinity, height: 12)
                    .shimmer()
            }
        }
    }
}

#Preview {
    VStack(spacing: 16) {
        SkeletonView(shape: .foodRow)
        SkeletonView(shape: .recipeRow)
        SkeletonView(shape: .groceryRow)
        SkeletonView(shape: .mealSlotCard)
    }
    .padding()
}
