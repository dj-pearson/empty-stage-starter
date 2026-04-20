#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Bridges Objective-C @try/@catch into Swift. Required because Swift's
/// do/catch cannot catch Objective-C NSExceptions — frameworks like
/// HealthKit raise them from internal validation paths, and the process
/// aborts with SIGABRT when nothing catches them.
///
/// Usage from Swift:
///
///     do {
///         try NSExceptionCatcher.try {
///             // Objective-C code that might raise
///         }
///     } catch {
///         // Handle as a normal Swift error
///     }
@interface NSExceptionCatcher : NSObject

/// Runs `block` inside an @try/@catch and converts any NSException into
/// an NSError (domain `NSExceptionCatcher`, the NSException's name as
/// code-description, and the NSException's reason + userInfo preserved
/// under `userInfo`).
+ (BOOL)tryBlock:(__attribute__((noescape)) void (^)(void))block
           error:(NSError * _Nullable __autoreleasing * _Nullable)error
NS_SWIFT_NAME(try(_:));

@end

NS_ASSUME_NONNULL_END
