import Foundation
import SwiftUI
import TipKit

/// TipKit tips that progressively introduce gesture-based interactions
/// (swipe actions, drag-and-drop, context menus) added in US-135 / US-136 / US-137.
///
/// Each tip shows at most a few times per install and is invalidated once the user
/// performs the gesture it describes. `Tips.configure(...)` is called from `EatPalApp`
/// at launch.

// MARK: - Events

enum TipEvents {
    static let didSwipeGrocery = Tips.Event(id: "didSwipeGrocery")
    static let didSwipePantry = Tips.Event(id: "didSwipePantry")
    static let didSwipeRecipe = Tips.Event(id: "didSwipeRecipe")
    static let didUseContextMenu = Tips.Event(id: "didUseContextMenu")
    static let didDragFood = Tips.Event(id: "didDragFood")
}

// MARK: - Grocery swipe tip

struct SwipeGroceryTip: Tip {
    var title: Text {
        Text("Swipe to shop faster")
    }

    var message: Text? {
        Text("Swipe right on any item to mark it bought. Swipe left to edit or delete.")
    }

    var image: Image? {
        Image(systemName: "checkmark.circle.fill")
    }

    var rules: [Rule] {
        #Rule(TipEvents.didSwipeGrocery) { $0.donations.count == 0 }
    }
}

// MARK: - Pantry swipe tip

struct SwipePantryTip: Tip {
    var title: Text {
        Text("Swipe to restock")
    }

    var message: Text? {
        Text("Swipe right for +1 in pantry or to flip the Safe flag. Swipe left to move an item to your grocery list.")
    }

    var image: Image? {
        Image(systemName: "plus.circle.fill")
    }

    var rules: [Rule] {
        #Rule(TipEvents.didSwipePantry) { $0.donations.count == 0 }
    }
}

// MARK: - Recipe swipe tip

struct SwipeRecipeTip: Tip {
    var title: Text {
        Text("Turn recipes into groceries")
    }

    var message: Text? {
        Text("Swipe right on a recipe to add every linked ingredient to your grocery list at once.")
    }

    var image: Image? {
        Image(systemName: "cart.fill.badge.plus")
    }

    var rules: [Rule] {
        #Rule(TipEvents.didSwipeRecipe) { $0.donations.count == 0 }
    }
}

// MARK: - Context menu tip

struct ContextMenuTip: Tip {
    var title: Text {
        Text("Long-press for more")
    }

    var message: Text? {
        Text("Hold any food, grocery, or recipe row to see the full action menu — including preview, try-bite, duplicate, and edit.")
    }

    var image: Image? {
        Image(systemName: "hand.tap.fill")
    }

    var rules: [Rule] {
        #Rule(TipEvents.didUseContextMenu) { $0.donations.count == 0 }
    }
}
