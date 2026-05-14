# Keep kotlinx.serialization classes — required for @Serializable models.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.eatpal.app.**$$serializer { *; }
-keepclassmembers class com.eatpal.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.eatpal.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Hilt
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager.FragmentContextWrapper { *; }

# Supabase-kt / Ktor
-keep class io.ktor.** { *; }
-keep class io.github.jan.supabase.** { *; }

# Ktor's IntellijIdeaDebugDetector references JVM-only java.lang.management.*,
# which doesn't exist on Android. Safe to ignore — only used for IDE debugging.
-dontwarn java.lang.management.ManagementFactory
-dontwarn java.lang.management.RuntimeMXBean
