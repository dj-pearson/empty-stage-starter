#import "NSExceptionCatcher.h"

NSString * const NSExceptionCatcherErrorDomain = @"NSExceptionCatcher";

@implementation NSExceptionCatcher

+ (BOOL)tryBlock:(__attribute__((noescape)) void (^)(void))block
           error:(NSError * _Nullable __autoreleasing * _Nullable)error {
    @try {
        block();
        return YES;
    } @catch (NSException *exception) {
        if (error) {
            NSMutableDictionary *userInfo = [NSMutableDictionary dictionary];
            userInfo[NSLocalizedDescriptionKey] = exception.reason ?: exception.name ?: @"Objective-C exception";
            if (exception.name) { userInfo[@"exceptionName"] = exception.name; }
            if (exception.reason) { userInfo[@"exceptionReason"] = exception.reason; }
            if (exception.userInfo) { userInfo[@"exceptionUserInfo"] = exception.userInfo; }
            if (exception.callStackSymbols) { userInfo[@"callStackSymbols"] = exception.callStackSymbols; }
            *error = [NSError errorWithDomain:NSExceptionCatcherErrorDomain
                                          code:1
                                      userInfo:userInfo];
        }
        return NO;
    }
}

@end
