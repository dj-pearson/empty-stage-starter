import SwiftUI
import PhotosUI

/// A SwiftUI wrapper around PHPickerViewController for selecting photos.
struct ImagePicker: View {
    @Binding var selectedImage: UIImage?
    @State private var pickerItem: PhotosPickerItem?

    var label: String = "Select Photo"

    var body: some View {
        PhotosPicker(selection: $pickerItem, matching: .images) {
            if let image = selectedImage {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 120, height: 120)
                    .clipShape(RoundedRectangle(cornerRadius: AppTheme.Radius.md))
                    .overlay(
                        RoundedRectangle(cornerRadius: AppTheme.Radius.md)
                            .stroke(Color(.separator), lineWidth: 1)
                    )
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "pencil.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.white)
                            .background(Circle().fill(.green))
                            .offset(x: 4, y: 4)
                    }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "photo.badge.plus")
                        .font(.title2)
                        .foregroundStyle(.green)
                    Text(label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(width: 120, height: 120)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: AppTheme.Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.Radius.md)
                        .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [6]))
                        .foregroundStyle(Color(.separator))
                )
            }
        }
        .onChange(of: pickerItem) { _, newItem in
            Task {
                if let data = try? await newItem?.loadTransferable(type: Data.self),
                   let uiImage = UIImage(data: data) {
                    selectedImage = ImageUploadService.resize(uiImage)
                }
            }
        }
    }
}

/// A circular avatar image picker, suitable for profile photos.
struct AvatarImagePicker: View {
    @Binding var selectedImage: UIImage?
    var currentURL: String?
    var initials: String = ""
    var size: CGFloat = 80

    @State private var pickerItem: PhotosPickerItem?

    var body: some View {
        PhotosPicker(selection: $pickerItem, matching: .images) {
            ZStack {
                if let image = selectedImage {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: size, height: size)
                        .clipShape(Circle())
                } else if let url = currentURL, let imageURL = URL(string: url) {
                    AsyncImage(url: imageURL) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                                .frame(width: size, height: size)
                                .clipShape(Circle())
                        default:
                            initialsView
                        }
                    }
                } else {
                    initialsView
                }

                // Edit badge
                Circle()
                    .fill(.green)
                    .frame(width: 28, height: 28)
                    .overlay {
                        Image(systemName: "camera.fill")
                            .font(.caption2)
                            .foregroundStyle(.white)
                    }
                    .offset(x: size / 3, y: size / 3)
            }
        }
        .onChange(of: pickerItem) { _, newItem in
            Task {
                if let data = try? await newItem?.loadTransferable(type: Data.self),
                   let uiImage = UIImage(data: data) {
                    selectedImage = ImageUploadService.resize(uiImage, maxDimension: 512)
                }
            }
        }
    }

    private var initialsView: some View {
        Circle()
            .fill(Color.green.opacity(0.2))
            .frame(width: size, height: size)
            .overlay {
                Text(initials)
                    .font(.system(size: size * 0.35))
                    .fontWeight(.bold)
                    .foregroundStyle(.green)
            }
    }
}

#Preview {
    VStack {
        ImagePicker(selectedImage: .constant(nil))
        AvatarImagePicker(selectedImage: .constant(nil), initials: "JP")
    }
    .padding()
}
