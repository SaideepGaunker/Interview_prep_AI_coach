/**
 * Interview Controller - Component-based Architecture
 */
(function() {
    'use strict';

    angular
        .module('interviewPrepApp')
        .controller('InterviewController', InterviewController);

    InterviewController.$inject = ['$scope', '$location', '$timeout', '$interval', 'AuthService', 'InterviewService'];

    function InterviewController($scope, $location, $timeout, $interval, AuthService, InterviewService) {
        var vm = this;

        // Properties
        vm.config = {
            target_role: 'Marketing Manager',
            session_type: 'mixed',
            difficulty: 'intermediate',
            duration: 30,
            question_count: 5,
            enable_video: true,
            enable_audio: true
        };
        
        vm.session = null;
        vm.questions = [];
        vm.currentQuestion = null;
        vm.currentQuestionIndex = 0;
        vm.userAnswer = '';
        vm.loading = false;
        vm.error = '';
        vm.cameraError = '';
        vm.cameraReady = false;
        
        // Media properties
        vm.cameraActive = false;
        vm.microphoneActive = false;
        vm.isRecording = false;
        vm.mediaStream = null;
        vm.mediaRecorder = null;
        
        // Timer properties
        vm.sessionTimeRemaining = 0;
        vm.questionTimeRemaining = 0;
        vm.sessionTimer = null;
        vm.questionTimer = null;
        vm.isPaused = false;
        
        // Feedback properties
        vm.realTimeFeedback = null;
        
        // Methods
        vm.startInterview = startInterview;
        vm.startTest = startTest;
        vm.goToDashboard = goToDashboard;
        vm.submitAnswer = submitAnswer;
        vm.skipQuestion = skipQuestion;
        vm.nextQuestion = nextQuestion;
        vm.pauseSession = pauseSession;
        vm.resumeSession = resumeSession;
        vm.endSession = endSession;
        vm.startCamera = startCamera;
        vm.stopCamera = stopCamera;
        vm.toggleCamera = toggleCamera;
        vm.toggleMicrophone = toggleMicrophone;
        vm.toggleRecording = toggleRecording;
        vm.formatTime = formatTime;

        // Initialize
        activate();

        function activate() {
            // Check authentication
            if (!AuthService.isAuthenticated()) {
                $location.path('/login');
                return;
            }
            
            // Initialize media on load
            initializeMedia();
            
            // Auto-start camera preview
            $timeout(function() {
                startCamera();
            }, 1000);
        }

        function goToDashboard() {
            stopCamera();
            $location.path('/dashboard');
        }

        function startInterview() {
            if (!validateConfig()) {
                return;
            }

            vm.loading = true;
            vm.error = '';

            console.log('Starting interview with config:', vm.config);

            InterviewService.startSession(vm.config)
                .then(function(response) {
                    console.log('Interview session started:', response);
                    vm.session = response.session;
                    vm.questions = response.questions;
                    vm.currentQuestion = vm.questions[0];
                    vm.currentQuestionIndex = 0;
                    
                    // Initialize timers
                    vm.sessionTimeRemaining = vm.session.duration * 60; // Convert to seconds
                    vm.questionTimeRemaining = vm.currentQuestion.expected_duration * 60;
                    
                    startTimers();
                    startCamera(); // Auto-start camera for interview
                })
                .catch(function(error) {
                    console.error('Interview session error:', error);
                    vm.error = error.data?.detail || 'Failed to start interview session.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }

        function startTest() {
            vm.loading = true;
            vm.error = '';

            var testConfig = {
                target_role: 'Product Manager',
                session_type: 'technical',
                difficulty: 'advanced',
                duration: 30,
                question_count: 5
            };

            console.log('Starting test session with config:', testConfig);

            InterviewService.startTestSession(testConfig)
                .then(function(response) {
                    console.log('Test session response:', response);
                    vm.session = response.session;
                    vm.questions = response.questions;
                    
                    if (vm.questions && vm.questions.length > 0) {
                        vm.currentQuestion = vm.questions[0];
                        vm.currentQuestionIndex = 0;
                        
                        console.log('Test questions loaded:', vm.questions);
                        console.log('Current test question:', vm.currentQuestion);
                        console.log('Total test questions:', vm.questions.length);
                        
                        // Initialize timers
                        vm.sessionTimeRemaining = testConfig.duration * 60;
                        vm.questionTimeRemaining = vm.currentQuestion.expected_duration * 60;
                        
                        startTimers();
                        startCamera();
                    } else {
                        vm.error = 'No questions received for test session.';
                    }
                })
                .catch(function(error) {
                    console.error('Test session error:', error);
                    vm.error = error.data?.detail || 'Failed to start test session.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }

        function submitAnswer() {
            if (!vm.userAnswer.trim()) {
                vm.error = 'Please provide an answer before submitting.';
                return;
            }

            vm.loading = true;
            vm.error = '';

            // Calculate response time properly (ensure it's positive)
            var responseTime = Math.max(1, (vm.currentQuestion.expected_duration * 60) - (vm.questionTimeRemaining || 0));
            
            var answerData = {
                question_id: vm.currentQuestion.id || vm.currentQuestion.question_id,
                answer_text: vm.userAnswer,
                response_time: Math.floor(responseTime) // Ensure it's an integer
            };

            console.log('Submitting answer data:', answerData);

            InterviewService.submitAnswer(vm.session.id, answerData)
                .then(function(response) {
                    // Show real-time feedback
                    if (response.feedback) {
                        vm.realTimeFeedback = response.feedback;
                    }
                    
                    // Clear answer and move to next question
                    vm.userAnswer = '';
                    nextQuestion();
                })
                .catch(function (error) {
                    console.error('Answer submission error:', error);
                    vm.error = error.data?.detail || 'Failed to submit answer.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }

        function skipQuestion() {
            vm.userAnswer = '';
            nextQuestion();
        }

        function nextQuestion() {
            if (vm.currentQuestionIndex < vm.questions.length - 1) {
                vm.currentQuestionIndex++;
                vm.currentQuestion = vm.questions[vm.currentQuestionIndex];
                vm.questionTimeRemaining = vm.currentQuestion.expected_duration * 60;
                vm.userAnswer = '';
            } else {
                // All questions completed
                endSession();
            }
        }

        function pauseSession() {
            vm.isPaused = true;
            stopTimers();
        }

        function resumeSession() {
            vm.isPaused = false;
            startTimers();
        }

        function endSession() {
            stopTimers();
            stopCamera();
            
            if (vm.session) {
                InterviewService.completeSession(vm.session.id)
                    .then(function(response) {
                        // Redirect to feedback page
                        $location.path('/interview/feedback/' + vm.session.id);
                    })
                    .catch(function(error) {
                        console.error('Error ending session:', error);
                        // Still redirect to dashboard even if end session fails
                        $location.path('/dashboard');
                    });
            } else {
                $location.path('/dashboard');
            }
        }

        function validateConfig() {
            if (!vm.config.target_role || !vm.config.session_type || 
                !vm.config.difficulty || !vm.config.duration || !vm.config.question_count) {
                vm.error = 'Please fill in all required fields.';
                return false;
            }
            return true;
        }

        function startTimers() {
            // Session timer
            vm.sessionTimer = $interval(function() {
                if (vm.sessionTimeRemaining > 0) {
                    vm.sessionTimeRemaining--;
                } else {
                    endSession();
                }
            }, 1000);

            // Question timer
            vm.questionTimer = $interval(function() {
                if (vm.questionTimeRemaining > 0) {
                    vm.questionTimeRemaining--;
                } else {
                    // Auto-submit or move to next question
                    if (vm.userAnswer.trim()) {
                        submitAnswer();
                    } else {
                        nextQuestion();
                    }
                }
            }, 1000);
        }

        function stopTimers() {
            if (vm.sessionTimer) {
                $interval.cancel(vm.sessionTimer);
                vm.sessionTimer = null;
            }
            if (vm.questionTimer) {
                $interval.cancel(vm.questionTimer);
                vm.questionTimer = null;
            }
        }

        function formatTime(seconds) {
            var minutes = Math.floor(seconds / 60);
            var remainingSeconds = seconds % 60;
            return minutes + ':' + (remainingSeconds < 10 ? '0' : '') + remainingSeconds;
        }

        function initializeMedia() {
            // Check for media device support
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.warn('Media devices not supported');
                return;
            }
        }

        function startCamera() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                vm.cameraError = 'Camera not supported in this browser.';
                return;
            }

            vm.cameraError = '';
            vm.loading = true;
            console.log('Starting camera...');

            navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }, 
                audio: true 
            })
                .then(function(stream) {
                    console.log('Camera stream obtained:', stream);
                    vm.mediaStream = stream;
                    vm.cameraActive = true;
                    vm.microphoneActive = true;
                    vm.cameraReady = true;
                    vm.cameraError = '';
                    
                    // Wait a bit for DOM to be ready, then set video source
                    $timeout(function() {
                        var videoElement = document.getElementById('previewVideo') || document.getElementById('userVideo');
                        console.log('Video element found:', videoElement);
                        
                        if (videoElement) {
                            videoElement.srcObject = stream;
                            videoElement.onloadedmetadata = function() {
                                console.log('Video metadata loaded, playing...');
                                videoElement.play().catch(function(e) {
                                    console.error('Error playing video:', e);
                                });
                            };
                        } else {
                            console.error('Video element not found!');
                            vm.cameraError = 'Video element not found in DOM';
                        }
                    }, 100);
                })
                .catch(function(error) {
                    console.error('Error accessing media devices:', error);
                    vm.cameraActive = false;
                    vm.cameraReady = false;
                    
                    if (error.name === 'NotAllowedError') {
                        vm.cameraError = 'Camera access denied. Please enable camera permissions.';
                    } else if (error.name === 'NotFoundError') {
                        vm.cameraError = 'No camera found. Please connect a camera.';
                    } else if (error.name === 'NotReadableError') {
                        vm.cameraError = 'Camera is already in use by another application.';
                    } else {
                        vm.cameraError = 'Unable to access camera: ' + error.message;
                    }
                    
                    // Apply scope changes
                    if (!$scope.$$phase) {
                        $scope.$apply();
                    }
                })
                .finally(function() {
                    vm.loading = false;
                    if (!$scope.$$phase) {
                        $scope.$apply();
                    }
                });
        }

        function stopCamera() {
            if (vm.mediaStream) {
                vm.mediaStream.getTracks().forEach(function(track) {
                    track.stop();
                });
                vm.mediaStream = null;
            }
            vm.cameraActive = false;
            vm.microphoneActive = false;
            vm.cameraReady = false;
            vm.cameraError = '';
            
            var videoElement = document.getElementById('previewVideo') || document.getElementById('userVideo');
            if (videoElement) {
                videoElement.srcObject = null;
            }
            
            // Apply scope changes
            if (!$scope.$$phase) {
                $scope.$apply();
            }
        }

        function toggleCamera() {
            if (vm.cameraActive) {
                stopCamera();
            } else {
                startCamera();
            }
        }

        function toggleMicrophone() {
            if (vm.mediaStream) {
                var audioTracks = vm.mediaStream.getAudioTracks();
                audioTracks.forEach(function(track) {
                    track.enabled = !track.enabled;
                });
                vm.microphoneActive = !vm.microphoneActive;
            }
        }

        function toggleRecording() {
            if (vm.isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
        }

        function startRecording() {
            if (!vm.mediaStream) {
                vm.error = 'No media stream available for recording.';
                return;
            }

            try {
                vm.mediaRecorder = new MediaRecorder(vm.mediaStream);
                vm.mediaRecorder.start();
                vm.isRecording = true;
                
                vm.mediaRecorder.ondataavailable = function(event) {
                    // Handle recorded data
                    console.log('Recording data available:', event.data);
                };
                
                vm.mediaRecorder.onstop = function() {
                    vm.isRecording = false;
                };
            } catch (error) {
                console.error('Error starting recording:', error);
                vm.error = 'Failed to start recording.';
            }
        }

        function stopRecording() {
            if (vm.mediaRecorder && vm.isRecording) {
                vm.mediaRecorder.stop();
                vm.isRecording = false;
            }
        }

        // Cleanup on destroy
        vm.$onDestroy = function() {
            stopTimers();
            stopCamera();
            stopRecording();
        };
    }
})();