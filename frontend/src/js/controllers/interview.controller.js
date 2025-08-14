/**
 * Interview Controller for interview session management
 */
(function() {
    'use strict';

    angular
        .module('interviewPrepApp')
        .controller('InterviewController', InterviewController);

    InterviewController.$inject = ['$location', '$interval', '$timeout', 'AuthService', 'InterviewService'];

    function InterviewController($location, $interval, $timeout, AuthService, InterviewService) {
        var vm = this;
        
        // Properties
        vm.user = AuthService.getCurrentUser();
        vm.currentStep = 'setup'; // setup, interview, feedback
        vm.loading = false;
        vm.error = '';
        vm.success = '';
        
        // Session data
        vm.session = null;
        vm.questions = [];
        vm.currentQuestionIndex = 0;
        vm.currentQuestion = null;
        vm.userAnswer = '';
        vm.sessionTimer = null;
        vm.questionTimer = null;
        vm.timeRemaining = 0;
        vm.questionTimeRemaining = 0;
        vm.isTestMode = false;
        
        // Setup form
        vm.setupForm = {
            target_role: '',
            session_type: 'mixed',
            difficulty: 'intermediate',
            duration: 30,
            question_count: 5
        };
        
        // Media elements
        vm.videoElement = null;
        vm.audioContext = null;
        vm.mediaRecorder = null;
        vm.recordedChunks = [];
        vm.audioRecorder = null;
        vm.isRecording = false;
        vm.audioBlob = null;
        
        // Available options
        vm.sessionTypes = [
            { value: 'hr', label: 'HR Interview' },
            { value: 'technical', label: 'Technical Interview' },
            { value: 'mixed', label: 'Mixed Interview' }
        ];
        
        vm.difficulties = [
            { value: 'beginner', label: 'Beginner' },
            { value: 'intermediate', label: 'Intermediate' },
            { value: 'advanced', label: 'Advanced' }
        ];
        
        vm.targetRoles = [
            'Software Developer',
            'Data Scientist',
            'Product Manager',
            'Marketing Manager',
            'Sales Representative',
            'Business Analyst',
            'UI/UX Designer',
            'DevOps Engineer',
            'Project Manager',
            'Consultant'
        ];
        
        // Methods
        vm.startInterview = startInterview;
        vm.startTest = startTest;
        vm.submitAnswer = submitAnswer;
        vm.pauseSession = pauseSession;
        vm.resumeSession = resumeSession;
        vm.completeSession = completeSession;
        vm.nextQuestion = nextQuestion;
        vm.previousQuestion = previousQuestion;
        vm.setupMediaCapture = setupMediaCapture;
        vm.startRecording = startRecording;
        vm.stopRecording = stopRecording;
        vm.startAudioRecording = startAudioRecording;
        vm.stopAudioRecording = stopAudioRecording;
        vm.playAudioRecording = playAudioRecording;
        vm.goToSetup = goToSetup;
        vm.goToDashboard = goToDashboard;
        
        // Initialize
        activate();
        
        function activate() {
            // Check if user has permission
            if (!vm.user) {
                $location.path('/login');
                return;
            }
            
            // Set default target role from user profile
            if (vm.user.target_roles && vm.user.target_roles.length > 0) {
                vm.setupForm.target_role = vm.user.target_roles[0];
            }
            
            // Setup media capture
            setupMediaCapture();
        }
        
        function startInterview() {
            vm.loading = true;
            vm.error = '';
            
            if (!validateSetupForm()) {
                vm.loading = false;
                return;
            }
            
            InterviewService.startSession(vm.setupForm)
                .then(function(response) {
                    console.log('Interview session response:', response);
                    vm.session = response.session;
                    vm.questions = response.questions || [];
                    vm.currentQuestionIndex = 0;
                    vm.currentQuestion = vm.questions[0];
                    vm.currentStep = 'interview';
                    
                    console.log('Questions loaded:', vm.questions);
                    console.log('Current question:', vm.currentQuestion);
                    
                    // Start session timer
                    startSessionTimer();
                    
                    // Start question timer
                    startQuestionTimer();
                    
                    // Start recording
                    startRecording();
                    
                    vm.success = 'Interview session started successfully!';
                    $timeout(function() { vm.success = ''; }, 3000);
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
            
            if (!validateSetupForm()) {
                vm.loading = false;
                return;
            }
            
            // For test mode, we'll use a simpler approach without recording
            InterviewService.startTestSession(vm.setupForm)
                .then(function(response) {
                    console.log('Test session response:', response);
                    vm.session = response.session;
                    vm.questions = response.questions || [];
                    vm.currentQuestionIndex = 0;
                    vm.currentQuestion = vm.questions[0];
                    vm.currentStep = 'interview';
                    vm.isTestMode = true;
                    
                    console.log('Test questions loaded:', vm.questions);
                    console.log('Current test question:', vm.currentQuestion);
                    
                    // Start session timer
                    startSessionTimer();
                    
                    // Start question timer
                    startQuestionTimer();
                    
                    vm.success = 'Test session started successfully!';
                    $timeout(function() { vm.success = ''; }, 3000);
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
            
            var answerData = {
                question_id: vm.currentQuestion.question_id,
                answer_text: vm.userAnswer,
                response_time: vm.currentQuestion.expected_duration * 60 - vm.questionTimeRemaining
            };
            
            InterviewService.submitAnswer(vm.session.id, answerData)
                .then(function(response) {
                    // Show real-time feedback
                    if (response.real_time_feedback) {
                        showQuickFeedback(response.real_time_feedback);
                    }
                    
                    // Move to next question or complete session
                    if (response.session_completed) {
                        completeSession();
                    } else if (response.next_question_id) {
                        nextQuestion();
                    }
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Failed to submit answer.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }
        
        function nextQuestion() {
            if (vm.currentQuestionIndex < vm.questions.length - 1) {
                vm.currentQuestionIndex++;
                vm.currentQuestion = vm.questions[vm.currentQuestionIndex];
                vm.userAnswer = '';
                
                // Reset question timer
                startQuestionTimer();
            }
        }
        
        function previousQuestion() {
            if (vm.currentQuestionIndex > 0) {
                vm.currentQuestionIndex--;
                vm.currentQuestion = vm.questions[vm.currentQuestionIndex];
                // Note: Don't reset answer as user might want to review
            }
        }
        
        function pauseSession() {
            if (!vm.session) return;
            
            InterviewService.pauseSession(vm.session.id)
                .then(function(response) {
                    vm.session.status = 'paused';
                    stopTimers();
                    stopRecording();
                    vm.success = 'Session paused successfully.';
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Failed to pause session.';
                });
        }
        
        function resumeSession() {
            if (!vm.session) return;
            
            InterviewService.resumeSession(vm.session.id)
                .then(function(response) {
                    vm.session.status = 'active';
                    startSessionTimer();
                    startQuestionTimer();
                    startRecording();
                    vm.success = 'Session resumed successfully.';
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Failed to resume session.';
                });
        }
        
        function completeSession() {
            if (!vm.session) return;
            
            vm.loading = true;
            
            InterviewService.completeSession(vm.session.id)
                .then(function(response) {
                    vm.session = response.session;
                    vm.sessionSummary = response.summary;
                    vm.currentStep = 'feedback';
                    
                    // Stop all timers and recording
                    stopTimers();
                    stopRecording();
                    
                    vm.success = 'Interview session completed!';
                })
                .catch(function(error) {
                    vm.error = error.data?.detail || 'Failed to complete session.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }
        
        function setupMediaCapture() {
            // Request camera and microphone access
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        facingMode: 'user'
                    }, 
                    audio: true 
                })
                .then(function(stream) {
                    // Get all video elements
                    var videoElements = document.querySelectorAll('#userVideo');
                    
                    videoElements.forEach(function(videoElement) {
                        if (videoElement) {
                            videoElement.srcObject = stream;
                            videoElement.play().catch(function(e) {
                                console.log('Video play failed:', e);
                            });
                        }
                    });
                    
                    vm.videoElement = videoElements[0];
                    
                    // Setup media recorder
                    vm.mediaRecorder = new MediaRecorder(stream);
                    vm.mediaRecorder.ondataavailable = function(event) {
                        if (event.data.size > 0) {
                            vm.recordedChunks.push(event.data);
                        }
                    };
                    
                    vm.success = 'Camera and microphone access granted!';
                    $timeout(function() { vm.success = ''; }, 3000);
                })
                .catch(function(error) {
                    console.error('Error accessing media devices:', error);
                    vm.error = 'Unable to access camera/microphone. Please check permissions and try again.';
                    
                    // Show fallback message
                    var videoElements = document.querySelectorAll('#userVideo');
                    videoElements.forEach(function(videoElement) {
                        if (videoElement) {
                            videoElement.style.display = 'none';
                            var fallbackDiv = document.createElement('div');
                            fallbackDiv.className = 'alert alert-warning';
                            fallbackDiv.innerHTML = '<i class="fas fa-exclamation-triangle me-2"></i>Camera access denied. Please enable camera permissions.';
                            videoElement.parentNode.appendChild(fallbackDiv);
                        }
                    });
                });
            } else {
                vm.error = 'Media devices not supported in this browser.';
            }
        }
        
        function startRecording() {
            if (vm.mediaRecorder && vm.mediaRecorder.state === 'inactive') {
                vm.recordedChunks = [];
                vm.mediaRecorder.start(1000); // Record in 1-second chunks
            }
        }
        
        function stopRecording() {
            if (vm.mediaRecorder && vm.mediaRecorder.state === 'recording') {
                vm.mediaRecorder.stop();
            }
        }
        
        function startAudioRecording() {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(function(stream) {
                        vm.audioRecorder = new MediaRecorder(stream);
                        vm.recordedChunks = [];
                        
                        vm.audioRecorder.ondataavailable = function(event) {
                            if (event.data.size > 0) {
                                vm.recordedChunks.push(event.data);
                            }
                        };
                        
                        vm.audioRecorder.onstop = function() {
                            vm.audioBlob = new Blob(vm.recordedChunks, { type: 'audio/wav' });
                            vm.isRecording = false;
                        };
                        
                        vm.audioRecorder.start();
                        vm.isRecording = true;
                        
                        vm.success = 'Audio recording started!';
                        $timeout(function() { vm.success = ''; }, 2000);
                    })
                    .catch(function(error) {
                        console.error('Error accessing microphone:', error);
                        vm.error = 'Unable to access microphone. Please check permissions.';
                    });
            }
        }
        
        function stopAudioRecording() {
            if (vm.audioRecorder && vm.audioRecorder.state === 'recording') {
                vm.audioRecorder.stop();
                vm.isRecording = false;
                
                vm.success = 'Audio recording stopped!';
                $timeout(function() { vm.success = ''; }, 2000);
            }
        }
        
        function playAudioRecording() {
            if (vm.audioBlob) {
                var audioPlayer = document.getElementById('audioPlayer');
                var audioUrl = URL.createObjectURL(vm.audioBlob);
                audioPlayer.src = audioUrl;
                audioPlayer.style.display = 'block';
                audioPlayer.play();
            }
        }
        
        function startSessionTimer() {
            if (vm.sessionTimer) {
                $interval.cancel(vm.sessionTimer);
            }
            
            vm.timeRemaining = vm.session.duration * 60; // Convert to seconds
            
            vm.sessionTimer = $interval(function() {
                vm.timeRemaining--;
                
                if (vm.timeRemaining <= 0) {
                    completeSession();
                }
            }, 1000);
        }
        
        function startQuestionTimer() {
            if (vm.questionTimer) {
                $interval.cancel(vm.questionTimer);
            }
            
            if (vm.currentQuestion) {
                vm.questionTimeRemaining = vm.currentQuestion.expected_duration * 60;
                
                vm.questionTimer = $interval(function() {
                    vm.questionTimeRemaining--;
                    
                    if (vm.questionTimeRemaining <= 0) {
                        // Auto-submit or move to next question
                        if (vm.userAnswer.trim()) {
                            submitAnswer();
                        } else {
                            nextQuestion();
                        }
                    }
                }, 1000);
            }
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
        
        function showQuickFeedback(feedback) {
            // Show quick feedback overlay
            vm.quickFeedback = feedback;
            $timeout(function() {
                vm.quickFeedback = null;
            }, 3000);
        }
        
        function validateSetupForm() {
            if (!vm.setupForm.target_role) {
                vm.error = 'Please select a target role.';
                return false;
            }
            
            if (vm.setupForm.duration < 5 || vm.setupForm.duration > 120) {
                vm.error = 'Duration must be between 5 and 120 minutes.';
                return false;
            }
            
            if (vm.setupForm.question_count < 1 || vm.setupForm.question_count > 20) {
                vm.error = 'Question count must be between 1 and 20.';
                return false;
            }
            
            return true;
        }
        
        function goToSetup() {
            vm.currentStep = 'setup';
            stopTimers();
            stopRecording();
        }
        
        function goToDashboard() {
            $location.path('/dashboard');
        }
        
        // Helper methods
        vm.formatTime = function(seconds) {
            var minutes = Math.floor(seconds / 60);
            var remainingSeconds = seconds % 60;
            return minutes + ':' + (remainingSeconds < 10 ? '0' : '') + remainingSeconds;
        };
        
        vm.getProgressPercentage = function() {
            if (!vm.questions.length) return 0;
            return (vm.currentQuestionIndex / vm.questions.length) * 100;
        };
        
        vm.getQuestionTypeIcon = function(type) {
            switch (type) {
                case 'behavioral': return 'fas fa-users';
                case 'technical': return 'fas fa-code';
                case 'situational': return 'fas fa-lightbulb';
                default: return 'fas fa-question-circle';
            }
        };
        
        // Cleanup on destroy
        vm.$onDestroy = function() {
            stopTimers();
            stopRecording();
        };
    }
})();